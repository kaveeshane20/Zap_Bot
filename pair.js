const fs = require("fs");
const { exec } = require("child_process");
const pino = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
} = require("@whiskeysockets/baileys");

const { upload } = require("./mega");

const numbers = [
  "94705344946", // Replace with real numbers
  "94711842684"
];

// Clean up session folder
function removeFolder(path) {
  if (fs.existsSync(path)) {
    fs.rmSync(path, { recursive: true, force: true });
  }
}

// Random file name generator
function randomId(length = 6) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return [...Array(length)].map(() => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// Pairing process for one number
async function pairNumber(number) {
  const sessionPath = `./session_${number}`;
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
    },
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    browser: Browsers.macOS("Safari"),
  });

  try {
    if (!sock.authState.creds.registered) {
      const code = await sock.requestPairingCode(number);
      console.log(`[${number}] Pairing code generated: ${code}`);

      sock.ev.on("creds.update", saveCreds);

      sock.ev.on("connection.update", async ({ connection }) => {
        if (connection === "open") {
          const userJid = jidNormalizedUser(sock.user.id);
          await delay(5000);

          const url = await upload(fs.createReadStream(`${sessionPath}/creds.json`), `${randomId()}.json`);
          const sessionId = url.replace("https://mega.nz/file/", "");

          const textMsg = `🔑 *Session ID for ${number}*\n\n👉 ${sessionId} 👈\n\n*Paste this in your config.js*`;
          await sock.sendMessage(userJid, {
            text: textMsg,
          });

          console.log(`[${number}] Session sent via WhatsApp`);

          await delay(2000);
          removeFolder(sessionPath);
          sock.end();
        }
      });
    } else {
      console.log(`[${number}] Already registered`);
      removeFolder(sessionPath);
    }
  } catch (err) {
    console.error(`[${number}] Error during pairing:`, err);
    removeFolder(sessionPath);
  }
}

// Main loop
async function startLoop() {
  for (const number of numbers) {
    await pairNumber(number);
    console.log(`Waiting 2 minutes before next number...`);
    await delay(120000); // 2 minutes
  }

  console.log("✅ All numbers processed");
}

startLoop();
