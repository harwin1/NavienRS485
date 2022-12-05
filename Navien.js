/**
 * RS485 Homegateway for Commax
 * @소스 공개 : Daehwan, Kang
 * @경동원 홈넷용으로 수정 : harwin
 * @수정일 2022-12-05
 */

const util = require('util');
const SerialPort = require('serialport').SerialPort;
const net = require('net');     // Socket
const mqtt = require('mqtt');

// 커스텀 파서
var Transform = require('stream').Transform;
util.inherits(CustomParser, Transform);

const CONFIG = require('/data/options.json');  //**** 애드온의 옵션을 불러옵니다. 이후 CONFIG.mqtt.username 과 같이 사용가능합니다.

const rs485Var = {
    type: CONFIG.type,
    win_port: CONFIG.serial.win_port,
    rpi_port: CONFIG.serial.rpi_port,
    sock_addr: CONFIG.socket.addr,
    sock_port: CONFIG.socket.port
}

const mqttVar = {
    broker: CONFIG.mqtt.broker,
    port: CONFIG.mqtt.port,
    username: CONFIG.mqtt.username,
    password: CONFIG.mqtt.password,
    clientId: 'navien-homenet'
}

const CONST = {
    // 메시지 Prefix 상수
    MSG_PREFIX: [0xF7],
    // 포트이름 설정
    portName: process.platform.startsWith('win') ? rs485Var.win_port : rs485Var.rpi_port,
    // SerialPort 전송 Delay(ms)
    sendDelay: CONFIG.sendDelay,
    // MQTT 수신 Delay(ms)
    mqttDelay: CONFIG.mqtt.receiveDelay,

    // 기기별 상태 및 제어 코드(HEX)
    DEVICE_STATE: [
        { deviceId: 'Light', subId: '1', stateHex: Buffer.alloc(9, 'F70E11C10200002B04', 'hex'), power: 'OFF' },
        { deviceId: 'Light', subId: '1', stateHex: Buffer.alloc(9, 'F70E11C10200012A04', 'hex'), power: 'ON' },
        { deviceId: 'Light', subId: '2', stateHex: Buffer.alloc(9, 'F70E12C10200002802', 'hex'), power: 'OFF' },
        { deviceId: 'Light', subId: '2', stateHex: Buffer.alloc(9, 'F70E12C10200012904', 'hex'), power: 'ON' },
        { deviceId: 'Light', subId: '3', stateHex: Buffer.alloc(9, 'F70E12C10200002904', 'hex'), power: 'OFF' },
        { deviceId: 'Light', subId: '3', stateHex: Buffer.alloc(9, 'F70E13C10200012804', 'hex'), power: 'ON' },
        { deviceId: 'Light', subId: '', stateHex: Buffer.alloc(18, 'F70E1F0100E70CF70E1F810400000000630C', 'hex'), alllight: 'OFF' },
        { deviceId: 'Light', subId: '', stateHex: Buffer.alloc(18, 'F70E1F0100E70CF70E1F810400000000630C', 'hex'), alllight: 'ON' },  //일괄 점등/소등
        //-> [조명] 5번째 바이트 하위 4바이트는: room_idx 6번째 바이트가 0x00: off/0x01: on

        { deviceId: 'Thermo', subId: '1', stateHex: Buffer.alloc(8, '', 'hex'), power: 'heat', setTemp: '', curTemp: '' },
        { deviceId: 'Thermo', subId: '1', stateHex: Buffer.alloc(8, '', 'hex'), power: 'off', setTemp: '', curTemp: '' },  //거실
        { deviceId: 'Thermo', subId: '2', stateHex: Buffer.alloc(8, '', 'hex'), power: 'heat', setTemp: '', curTemp: '' },
        { deviceId: 'Thermo', subId: '2', stateHex: Buffer.alloc(8, '', 'hex'), power: 'off', setTemp: '', curTemp: '' },
        { deviceId: 'Thermo', subId: '3', stateHex: Buffer.alloc(8, '', 'hex'), power: 'heat', setTemp: '', curTemp: '' },
        { deviceId: 'Thermo', subId: '3', stateHex: Buffer.alloc(8, '', 'hex'), power: 'off', setTemp: '', curTemp: '' },
        { deviceId: 'Thermo', subId: '4', stateHex: Buffer.alloc(8, '', 'hex'), power: 'heat', setTemp: '', curTemp: '' },
        { deviceId: 'Thermo', subId: '4', stateHex: Buffer.alloc(8, '', 'hex'), power: 'off', setTemp: '', curTemp: '' },
        { deviceId: 'Thermo', subId: '5', stateHex: Buffer.alloc(8, '', 'hex'), power: 'heat', setTemp: '', curTemp: '' },
        { deviceId: 'Thermo', subId: '5', stateHex: Buffer.alloc(8, '', 'hex'), power: 'off', setTemp: '', curTemp: '' },
        { deviceId: 'Thermo', subId: '', stateHex: Buffer.alloc(8, '', 'hex'), allthermo: 'heat' },
        { deviceId: 'Thermo', subId: '', stateHex: Buffer.alloc(8, '', 'hex'), allthermo: 'off' },  //난방전체 끄기/켜기

        { deviceId: 'Fan', subId: '1', stateHex: Buffer.alloc(8, '', 'hex'), power: 'OFF', speed: 'low' },
        { deviceId: 'Fan', subId: '1', stateHex: Buffer.alloc(8, '', 'hex'), power: 'ON', speed: 'low' },
        { deviceId: 'Fan', subId: '1', stateHex: Buffer.alloc(8, '', 'hex'), power: 'ON', speed: 'mid' },
        { deviceId: 'Fan', subId: '1', stateHex: Buffer.alloc(8, '', 'hex'), power: 'ON', speed: 'high' },

        //{ deviceId: 'Gas', subId: '1', stateHex: Buffer.alloc(8, '', 'hex'), power: 'OFF' },
        //{ deviceId: 'Gas', subId: '1', stateHex: Buffer.alloc(8, '', 'hex'), power: 'ON' },
        //{ deviceId: 'Gas', subId: '1', stateHex: Buffer.alloc(8, '', 'hex'), power: 'ON' } // moving
    ],

    DEVICE_COMMAND: [
        { deviceId: 'Light', subId: '1', commandHex: Buffer.alloc(8, 'F70E11410100A800', 'hex'), power: 'OFF' },
        { deviceId: 'Light', subId: '1', commandHex: Buffer.alloc(8, 'F70E11410101A902', 'hex'), power: 'ON' },
        { deviceId: 'Light', subId: '2', commandHex: Buffer.alloc(8, 'F70E12410100AB04', 'hex'), power: 'OFF' },
        { deviceId: 'Light', subId: '2', commandHex: Buffer.alloc(8, 'F70E12410101AA04', 'hex'), power: 'ON' },
        { deviceId: 'Light', subId: '3', commandHex: Buffer.alloc(8, 'F70E13410100AA04', 'hex'), power: 'OFF' },
        { deviceId: 'Light', subId: '3', commandHex: Buffer.alloc(8, 'F70E13410101AB06', 'hex'), power: 'ON' },
        { deviceId: 'Light', subId: '', commandHex: Buffer.alloc(8, 'F70EFF420100458C', 'hex'), alllight: 'OFF' },
        { deviceId: 'Light', subId: '', commandHex: Buffer.alloc(8, 'F70EFF420101448C', 'hex'), alllight: 'ON' },  //일괄 점등/소등
        //-> [조명] 5번째 바이트 하위 4바이트는: room_idx 6번째 바이트가 0x00: off/0x01: on

        { deviceId: 'Thermo', subId: '1', commandHex: Buffer.alloc(8, 'F736114301019316', 'hex'), power: 'heat', setTemp: '' },
        { deviceId: 'Thermo', subId: '1', commandHex: Buffer.alloc(8, 'F736114301009214', 'hex'), power: 'off', setTemp: '' },  //거실
        { deviceId: 'Thermo', subId: '2', commandHex: Buffer.alloc(8, 'F736124301019014', 'hex'), power: 'heat', setTemp: '' },
        { deviceId: 'Thermo', subId: '2', commandHex: Buffer.alloc(8, 'F736124301009114', 'hex'), power: 'off', setTemp: '' },
        { deviceId: 'Thermo', subId: '3', commandHex: Buffer.alloc(8, 'F736134301019116', 'hex'), power: 'heat', setTemp: '' },
        { deviceId: 'Thermo', subId: '3', commandHex: Buffer.alloc(8, 'F736134301009014', 'hex'), power: 'off', setTemp: '' },
        { deviceId: 'Thermo', subId: '4', commandHex: Buffer.alloc(8, 'F73614430101961C', 'hex'), power: 'heat', setTemp: '' },
        { deviceId: 'Thermo', subId: '4', commandHex: Buffer.alloc(8, 'F73614430100971C', 'hex'), power: 'off', setTemp: '' },
        { deviceId: 'Thermo', subId: '5', commandHex: Buffer.alloc(8, 'F73615430101971E', 'hex'), power: 'heat', setTemp: '' },
        { deviceId: 'Thermo', subId: '5', commandHex: Buffer.alloc(8, 'F73615430100961C', 'hex'), power: 'off', setTemp: '' },
        { deviceId: 'Thermo', subId: '', commandHex: Buffer.alloc(8, 'F7361F4301019D2E', 'hex'), allthermo: 'heat' },
        { deviceId: 'Thermo', subId: '', commandHex: Buffer.alloc(8, 'F7361F4301009C2C', 'hex'), allthermo: 'off' },  //난방전체 끄기/켜기

        { deviceId: 'Fan', subId: '1', commandHex: Buffer.alloc(8, 'F7320141010084F0', 'hex'), power: 'OFF' }, //꺼짐
        { deviceId: 'Fan', subId: '1', commandHex: Buffer.alloc(8, 'F7320142010186F4', 'hex'), power: 'ON' }, //켜짐
        { deviceId: 'Fan', subId: '1', commandHex: Buffer.alloc(8, 'F7320142010186F4', 'hex'), speed: 'low' }, //약(켜짐)
        { deviceId: 'Fan', subId: '1', commandHex: Buffer.alloc(8, 'F7320142010285F4', 'hex'), speed: 'mid' }, //중(켜짐)
        { deviceId: 'Fan', subId: '1', commandHex: Buffer.alloc(8, 'F7320142010384F4', 'hex'), speed: 'high' }, //강(켜짐)

        { deviceId: 'Gas', subId: '1', commandHex: Buffer.alloc(8, 'F71201410100A4F0', 'hex'), power: 'OFF' },
        { deviceId: 'Gas', subId: '1', commandHex: Buffer.alloc(9, 'F712018102000463F4', 'hex'), power: 'ON' },
],

    // 상태 Topic (/homenet/${deviceId}${subId}/${property}/state/ = ${value})
    // 명령어 Topic (/homenet/${deviceId}${subId}/${property}/command/ = ${value})
    TOPIC_PRFIX: 'homenet',
    STATE_TOPIC: 'homenet/%s%s/%s/state', //상태 전달
    DEVICE_TOPIC: 'homenet/+/+/command' //명령 수신
};

// 시리얼 통신 파서 
function CustomParser(options) {
    if (!(this instanceof CustomParser))
        return new CustomParser(options);
    Transform.call(this, options);
    this._queueChunk = [];
    this._msgLenCount = 0;
    this._msgLength = 8;
    this._msgTypeFlag = false;
}

CustomParser.prototype._transform = function (chunk, encoding, done) {
    var start = 0;
    for (var i = 0; i < chunk.length; i++) {
        if (CONST.MSG_PREFIX.includes(chunk[i])) {			// 청크에 구분자(MSG_PREFIX)가 있으면
            this._queueChunk.push(chunk.slice(start, i));	// 구분자 앞부분을 큐에 저장하고
            this.push(Buffer.concat(this._queueChunk));	// 큐에 저장된 메시지들 합쳐서 내보냄
            this._queueChunk = [];	// 큐 초기화
            this._msgLenCount = 0;
            start = i;
            this._msgTypeFlag = true;	// 다음 바이트는 메시지 종류
        }
        // 메시지 종류에 따른 메시지 길이 파악
        else if (this._msgTypeFlag) {
            switch (chunk[i]) {
                case 0x36: case 0x11: case 0x44: case 0x12: case 0x01: case 0x41: case 0x1f: case 0x43: case 0x0e: case 0x42:
                    this._msgLength = 8; break;  //난방,가스,조명 상태/명령
                case 0x0e: case 0x1f: case 0x81:
                    this._msgLength = 11; break;  //조명 상태
                case 0x0e: case 0x1f: case 0x01:
                    this._msgLength = 18; break;  //조명 상태/쿼리
                case 0x12: case 0x01: case 0x81:
                    this._msgLength = 9; break;  //가스 명령
                default:
                    this._msgLength = 8;
            }
            this._msgTypeFlag = false;
        }
        this._msgLenCount++;
    }
    // 구분자가 없거나 구분자 뒷부분 남은 메시지 큐에 저장
    this._queueChunk.push(chunk.slice(start));

    // 메시지 길이를 확인하여 다 받았으면 내보냄
    if (this._msgLenCount >= this._msgLength) {
        this.push(Buffer.concat(this._queueChunk));	// 큐에 저장된 메시지들 합쳐서 내보냄
        this._queueChunk = [];	// 큐 초기화
        this._msgLenCount = 0;
    }

    done();
};

// 로그 표시
var log = (...args) => console.log('[' + new Date().toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'}) + ']', args.join(' '));

// 홈컨트롤 상태
var homeStatus = {};
var lastReceive = new Date().getTime();
var mqttReady = false;
var queue = new Array();

// MQTT-Broker 연결
const client = mqtt.connect('mqtt://' +CONST.mqttBroker, {
    clientId: CONST.clientID,
    username: CONST.mqttUser,
    password: CONST.mqttPass,
    port: CONST.mqttport
}, log("INFO   initialize mqtt..."));
client.on('connect', () => {
    client.subscribe(CONST.DEVICE_TOPIC, (err) => {if (err) log('MQTT Subscribe fail! -', CONST.DEVICE_TOPIC) });
});

// SerialPort/socket 모듈 초기화
if (rs485Var.type == 'serial') {
    log('Initializing: SERIAL');
    const rs485 = new SerialPort({
        path: CONST.portName,
        baudRate: 9600,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        autoOpen: false,
        encoding: 'hex'
    });
    parser = rs485.pipe(new CustomParser());
    port.on('open', () => log('Success open port:', CONST.portName));
    port.open((err) => {
        if (err) {
            return log('Error opening port:', err.message);
        }
    });
} else {
    log('Initializing: SOCKET');
    rs485 = new net.Socket();
    rs485.connect(rs485Var.port, rs485Var.addr, function () {
        log('INFO   Success connected to server', "(" + rs485Var.addr, rs485Var.port + ")");
    });
    rs485.on('error', (err) => {
        log('ERROR   server connection failed:', err.message)
    });
    parser = rs485.pipe(new CustomParser());
}

// 홈넷에서 SerialPort로 상태 정보 수신
parser.on('data', function (data) {
    //console.log('Receive interval: ', (new Date().getTime())-lastReceive, 'ms ->', data.toString('hex'));
    lastReceive = new Date().getTime();

    switch (data[3]) {
        case 0x81: case 0xc1:
            var objFound = CONST.DEVICE_STATE.find(obj => data.includes(obj.stateHex));
            if (objFound)
                updateStatus(objFound);
            break;
        
        case 0x44: // 온도조절기 상태 정보
            var objFound = CONST.DEVICE_STATE.find(obj => data.includes(obj.stateHex)); // 메시지 앞부분 매칭(온도부분 제외)
            if (objFound) {
                objFound.curTemp = data[5].toString(10); // 현재 온도
                objFound.setTemp = (data[6] / 10.0).toString(10); // 설정 온도
                updateStatus(objFound);
            }
            break;
    }
        
    switch (data[4]) {
        case 0x01: case 0x02:
            const ack = Buffer.alloc(1);
            data.copy(ack, 0, 1, 4);
            var objFoundIdx = queue.findIndex(obj => obj.commandHex.includes(ack));
            if (objFoundIdx > -1) {
                log('Success command:', data.toString('hex'));
                queue.splice(objFoundIdx, 1);
            }
            break;
    }
});

// MQTT로 HA에 상태값 전송
var updateStatus = (obj) => {
    var arrStateName = Object.keys(obj);
    // 상태값이 아닌 항목들은 제외 [deviceId, subId, stateHex, commandHex, sentTime]
    const arrFilter = ['deviceId', 'subId', 'stateHex', 'commandHex', 'sentTime'];
    arrStateName = arrStateName.filter(stateName => !arrFilter.includes(stateName));

    // 상태값별 현재 상태 파악하여 변경되었으면 상태 반영 (MQTT publish)
    arrStateName.forEach( function(stateName) {
        // 상태값이 없거나 상태가 같으면 반영 중지
        var curStatus = homeStatus[obj.deviceId+obj.subId+stateName];
        if(obj[stateName] == null || obj[stateName] === curStatus) return;
        // 미리 상태 반영한 device의 상태 원복 방지
        if(queue.length > 0) {
            var found = queue.find(q => q.deviceId+q.subId === obj.deviceId+obj.subId && q[stateName] === curStatus);
            if(found != null) return;
        }
        // 상태 반영 (MQTT publish)
        homeStatus[obj.deviceId+obj.subId+stateName] = obj[stateName];
        var topic = util.format(CONST.STATE_TOPIC, obj.deviceId, obj.subId, stateName);
        client.publish(topic, obj[stateName], {retain: true});
        log('[MQTT] Send to HA:', topic, '->', obj[stateName]);
    });
}

//////////////////////////////////////////////////////////////////////////////////////
// HA에서 MQTT로 제어 명령 수신
client.on('message', (topic, message) => {
    if(mqttReady) {
        var topics = topic.split('/');
        var value = message.toString(); // message buffer이므로 string으로 변환
        var objFound = null;

        if(topics[0] === CONST.TOPIC_PRFIX) {
            // 온도설정 명령의 경우 모든 온도를 Hex로 정의해두기에는 많으므로 온도에 따른 시리얼 통신 메시지 생성
            if(topics[2]==='setTemp') { 
                objFound = CONST.DEVICE_COMMAND.find(obj => obj.deviceId+obj.subId === topics[1] && obj.hasOwnProperty('setTemp'));
                objFound.commandHex[0] = Number(value);
                objFound.setTemp = String(Number(value)); // 온도값은 소수점이하는 버림
                var checkSum = objFound.commandHex[0] + objFound.commandHex[1] + objFound.commandHex[2] + objFound.commandHex[3]
                objFound.commandHex[7] = checkSum; // 마지막 Byte는 CHECKSUM
            }
            // 다른 명령은 미리 정의해놓은 값을 매칭
            else {
                objFound = CONST.DEVICE_COMMAND.find(obj => obj.deviceId+obj.subId === topics[1] && obj[topics[2]] === value);
            }
        }

        if(objFound == null) {
            log('[MQTT] Receive Unknown Msg.: ', topic, ':', value);
            return;
        }

        // 현재 상태와 같으면 Skip
        if(value === homeStatus[objFound.deviceId+objFound.subId+objFound[topics[2]]]) {
            log('[MQTT] Receive & Skip: ', topic, ':', value);
        }
        // Serial메시지 제어명령 전송 & MQTT로 상태정보 전송
        else {
            log('[MQTT] Receive from HA:', topic, ':', value);
            // 최초 실행시 딜레이 없도록 sentTime을 현재시간 보다 sendDelay만큼 이전으로 설정
            objFound.sentTime = (new Date().getTime())-CONST.sendDelay;
            queue.push(objFound);   // 실행 큐에 저장
            updateStatus(objFound); // 처리시간의 Delay때문에 미리 상태 반영
        }
    }
});

//////////////////////////////////////////////////////////////////////////////////////
// SerialPort로 제어 명령 전송

const commandProc = () => {
    // 큐에 처리할 메시지가 없으면 종료
    if(queue.length == 0) return;

    // 기존 홈넷 RS485 메시지와 충돌하지 않도록 Delay를 줌
    var delay = (new Date().getTime())-lastReceive;
    if(delay < CONST.sendDelay) return;

    // 큐에서 제어 메시지 가져오기
    var obj = queue.shift();
    rs485.write(obj.commandHex, (err) => {if(err)  return log('[Serial] Send Error: ', err.message); });
    lastReceive = new Date().getTime();
    obj.sentTime = lastReceive;     // 명령 전송시간 sentTime으로 저장
    log('[Serial] Send to Device:', obj.deviceId, obj.subId, '->', obj.state, '('+delay+'ms) ', obj.commandHex.toString('hex'));

    // 다시 큐에 저장하여 Ack 메시지 받을때까지 반복 실행
    queue.push(obj);
};

setTimeout(() => {mqttReady=true; log('MQTT Ready...')}, CONST.mqttDelay);
setInterval(commandProc, 20);
