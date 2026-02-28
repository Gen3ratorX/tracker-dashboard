#include <TinyGPS++.h>

// -- GPS Pins --
#define GPS_RX 4
#define GPS_TX 5
#define GPS_BAUD 9600

// -- SIM800 Pins --
#define SIM_RX 16
#define SIM_TX 17
#define SIM_BAUD 9600

// -- Config --
const char* APN = "internet";
const char* SERVER_URL = "http://85.31.238.242:3002/update-location";
const char* TRACKER_TOKEN = "replace_with_secure_token";
const char* ALERT_NUM = "+233547066242";
const float MOVE_LIMIT_METERS = 50.0f;
const unsigned long UPDATE_MS = 15000;
const unsigned long ALERT_COOLDOWN_MS = 5UL * 60UL * 1000UL;

// -- Objects --
HardwareSerial sim800(2);
HardwareSerial gpsSerial(1);
TinyGPSPlus gps;

// -- State --
double lastLat = 0.0;
double lastLng = 0.0;
bool gprsConnected = false;
bool baseSet = false;
unsigned long lastUpdate = 0;
unsigned long lastAlertSent = 0;

void flushSIM() {
  while (sim800.available()) {
    sim800.read();
  }
}

String readSIMUntil(const char* waitFor, unsigned long timeoutMs) {
  String res;
  res.reserve(256);
  const unsigned long start = millis();

  while (millis() - start < timeoutMs) {
    while (sim800.available()) {
      res += (char)sim800.read();
    }

    if (res.indexOf(waitFor) >= 0 || res.indexOf("ERROR") >= 0) {
      break;
    }

    delay(2);
  }

  return res;
}

String sendAT(const String& cmd, unsigned long timeoutMs, const char* waitFor = "OK") {
  flushSIM();
  sim800.println(cmd);
  String res = readSIMUntil(waitFor, timeoutMs);
  Serial.println("[AT] " + cmd + " => " + res);
  return res;
}

void sendSMS(const char* number, const char* message) {
  Serial.println("[ALERT] Sending SMS alert...");
  sendAT("AT+CMGF=1", 2000);
  sim800.println(String("AT+CMGS=\"") + number + "\"");
  delay(500);
  sim800.print(message);
  delay(200);
  sim800.write(26);  // Ctrl+Z
  delay(5000);
  Serial.println("[ALERT] SMS sent.");
}

bool gprsConnect() {
  Serial.println("[GPRS] Connecting...");

  sendAT("AT", 2000);
  sendAT("AT+CFUN=1", 3000);
  sendAT("AT+CPIN?", 3000);

  for (int i = 0; i < 10; i++) {
    String reg = sendAT("AT+CREG?", 2000);
    if (reg.indexOf(",1") >= 0 || reg.indexOf(",5") >= 0) {
      break;
    }
    delay(2000);
  }

  sendAT("AT+CGATT=1", 5000);
  sendAT("AT+SAPBR=0,1", 3000);
  delay(1000);
  sendAT("AT+SAPBR=3,1,\"Contype\",\"GPRS\"", 2000);

  String apnCmd = String("AT+SAPBR=3,1,\"APN\",\"") + APN + "\"";
  sendAT(apnCmd, 2000);

  sendAT("AT+SAPBR=1,1", 10000);
  delay(2000);

  String ip = sendAT("AT+SAPBR=2,1", 3000);
  if (ip.indexOf("0.0.0.0") >= 0 || ip.indexOf("ERROR") >= 0) {
    Serial.println("[GPRS] FAILED");
    return false;
  }

  Serial.println("[GPRS] Ready");
  return true;
}

bool parseHttpAction200(const String& response) {
  int firstComma = response.indexOf(',');
  if (firstComma < 0) return false;
  int secondComma = response.indexOf(',', firstComma + 1);
  if (secondComma < 0) return false;

  String codeStr = response.substring(firstComma + 1, secondComma);
  codeStr.trim();
  int statusCode = codeStr.toInt();
  return statusCode == 200;
}

bool postToServerOnce(const char* jsonPayload) {
  sendAT("AT+HTTPTERM", 1000);
  delay(500);

  if (sendAT("AT+HTTPINIT", 2000).indexOf("OK") < 0) {
    Serial.println("[HTTP] HTTPINIT failed");
    return false;
  }

  sendAT("AT+HTTPSSL=0", 1000);
  sendAT("AT+HTTPPARA=\"CID\",1", 1000);

  String urlCmd = String("AT+HTTPPARA=\"URL\",\"") + SERVER_URL + "\"";
  sendAT(urlCmd, 2000);

  String headerCmd = String("AT+HTTPPARA=\"USERDATA\",\"X-Tracker-Token: ") + TRACKER_TOKEN + "\"";
  sendAT(headerCmd, 2000);
  sendAT("AT+HTTPPARA=\"CONTENT\",\"application/json\"", 1000);

  flushSIM();
  sim800.println(String("AT+HTTPDATA=") + strlen(jsonPayload) + ",10000");
  String dataRes = readSIMUntil("DOWNLOAD", 5000);
  if (dataRes.indexOf("DOWNLOAD") < 0) {
    Serial.println("[HTTP] HTTPDATA prompt missing: " + dataRes);
    sendAT("AT+HTTPTERM", 1000);
    return false;
  }

  sim800.print(jsonPayload);
  String writeAck = readSIMUntil("OK", 5000);
  if (writeAck.indexOf("OK") < 0) {
    Serial.println("[HTTP] HTTPDATA write failed: " + writeAck);
    sendAT("AT+HTTPTERM", 1000);
    return false;
  }

  flushSIM();
  Serial.println("[HTTP] Executing POST...");
  sim800.println("AT+HTTPACTION=1");
  String actionRes = readSIMUntil("+HTTPACTION", 20000);
  sendAT("AT+HTTPTERM", 1000);

  if (parseHttpAction200(actionRes)) {
    Serial.println("[HTTP] POST success");
    return true;
  }

  Serial.println("[HTTP] POST failed: " + actionRes);
  return false;
}

bool postToServer(double lat, double lng, float spd, int sats) {
  char json[180];
  snprintf(
    json,
    sizeof(json),
    "{\"lat\":%.6f,\"lng\":%.6f,\"spd\":%.1f,\"sats\":%d}",
    lat,
    lng,
    spd,
    sats
  );

  Serial.print("[HTTP] Payload: ");
  Serial.println(json);

  if (postToServerOnce(json)) {
    return true;
  }

  Serial.println("[HTTP] Retry once...");
  return postToServerOnce(json);
}

float calcDistanceMeters(double lat1, double lng1, double lat2, double lng2) {
  return (float)TinyGPSPlus::distanceBetween(lat1, lng1, lat2, lng2);
}

void checkMovement(double lat, double lng) {
  if (!baseSet) {
    lastLat = lat;
    lastLng = lng;
    baseSet = true;
    Serial.println("[ALERT] Base position set");
    return;
  }

  float dist = calcDistanceMeters(lastLat, lastLng, lat, lng);
  Serial.print("[ALERT] Movement delta (m): ");
  Serial.println(dist, 2);

  if (dist <= MOVE_LIMIT_METERS) {
    return;
  }

  if ((millis() - lastAlertSent) < ALERT_COOLDOWN_MS) {
    Serial.println("[ALERT] Movement detected but cooldown is active");
    return;
  }

  Serial.println("[ALERT] Movement detected, sending SMS");

  char msg[220];
  snprintf(
    msg,
    sizeof(msg),
    "ALERT: Tracker moved!\nLat: %.6f\nLng: %.6f\nhttp://maps.google.com/?q=%.6f,%.6f",
    lat,
    lng,
    lat,
    lng
  );
  sendSMS(ALERT_NUM, msg);

  lastAlertSent = millis();
  lastLat = lat;
  lastLng = lng;
}

void setup() {
  Serial.begin(115200);
  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX, GPS_TX);
  sim800.begin(SIM_BAUD, SERIAL_8N1, SIM_RX, SIM_TX);

  delay(3000);
  Serial.println("[BOOT] Tracker starting");
  gprsConnected = gprsConnect();
}

void loop() {
  while (gpsSerial.available()) {
    gps.encode(gpsSerial.read());
  }

  if (millis() - lastUpdate <= UPDATE_MS) {
    return;
  }

  lastUpdate = millis();

  bool freshFix = gps.location.isValid() && gps.location.age() < 5000;
  if (!freshFix) {
    Serial.print("[GPS] Waiting fix | chars: ");
    Serial.print(gps.charsProcessed());
    Serial.print(" | failed: ");
    Serial.print(gps.failedChecksum());
    Serial.print(" | age(ms): ");
    Serial.println(gps.location.age());
    return;
  }

  double lat = gps.location.lat();
  double lng = gps.location.lng();
  float spd = gps.speed.kmph();
  int sats = gps.satellites.value();

  Serial.print("[GPS] ");
  Serial.print(lat, 6);
  Serial.print(", ");
  Serial.print(lng, 6);
  Serial.print(" | speed: ");
  Serial.print(spd);
  Serial.print(" km/h | sats: ");
  Serial.println(sats);

  checkMovement(lat, lng);

  if (!gprsConnected) {
    gprsConnected = gprsConnect();
  }

  if (!gprsConnected) {
    return;
  }

  bool ok = postToServer(lat, lng, spd, sats);
  if (!ok) {
    gprsConnected = false;
  }
}
