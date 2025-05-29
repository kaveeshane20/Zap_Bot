const express = require("express");
const fs = require("fs");
const { exec } = require("child_process");
const router = express.Router();
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

// Utility: Remove directory
function removeFile(filePath) {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { recursive: true, force: true });
  }
}

// Utility: Generate random file name
function randomMegaId(length = 6, numberLength = 4) {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  const number = Math.floor(Math.random() * Math.pow(10, numberLength));
  return `${result}${number}`;
}

router.get("/", async (req, res) => {
  let num = req.query.number;
  if (!num) return res.status(400).send({ error: "Phone number is required." });

  num = num.replace(/[^0-9]/g, ""); // Ensure clean number
  const sessionPath = "./session";

  async function RobinPair() {
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    try {
      const RobinPairWeb = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        browser: Browsers.macOS("Safari"),
      });

      if (!RobinPairWeb.authState.creds.registered) {
        await delay(1500);
        const code = await RobinPairWeb.requestPairingCode(num);
        console.log("Pairing code sent to:", num);

        if (!res.headersSent) {
          res.send({ code });
        }
      }

      RobinPairWeb.ev.on("creds.update", saveCreds);

      RobinPairWeb.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "open") {
          try {
            console.log("Connection open. Preparing to upload session...");
            await delay(10000); // Let the connection stabilize

            const credsPath = `${sessionPath}/creds.json`;
            const userJid = jidNormalizedUser(RobinPairWeb.user.id);

            const megaUrl = await upload(fs.createReadStream(credsPath), `${randomMegaId()}.json`);
            const sessionID = megaUrl.replace("https://mega.nz/file/", "");

            const messageText = `*ZapBot [The powerful WA BOT]*\n\n👉 ${sessionID} 👈\n\n*This is your Session ID. Copy this and paste into your config.js file.*\n\n*Need help?* wa.me/message/+94705344946\n\n*Join the WhatsApp group:* https://chat.whatsapp.com/GAOhr0qNK7KEvJwbenGivZ`;
            const warning = `🛑 *Do not share this code with anyone* 🛑`;

            await RobinPairWeb.sendMessage(userJid, {
              image: {
                url: "https://i.imgur.com/z0Z6g0F.png", // Replace with a valid image URL
              },
              caption: messageText,
            });

            await RobinPairWeb.sendMessage(userJid, { text: sessionID });
            await RobinPairWeb.sendMessage(userJid, { text: warning });

            console.log("Session sent successfully.");

            await delay(1000);
            removeFile(sessionPath);
            process.exit(0);
          } catch (err) {
            console.error("Error during session messaging:", err);
            exec("pm2 restart prabath");
          }
        } else if (
          connection === "close" &&
          lastDisconnect?.error?.output?.statusCode !== 401
        ) {
          console.log("Connection closed. Reconnecting...");
          await delay(10000);
          RobinPair();
        }
      });
    } catch (err) {
      console.error("Unexpected error:", err);
      exec("pm2 restart Robin-md");
      removeFile(sessionPath);
      if (!res.headersSent) {
        res.send({ code: "Service Unavailable" });
      }
    }
  }

  return await RobinPair();
});

// Catch uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  exec("pm2 restart Robin");
});

module.exports = router;
