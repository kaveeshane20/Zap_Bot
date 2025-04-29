router.get("/", async (req, res) => {
  let num = req.query.number?.replace(/[^0-9]/g, "");
  let interval; // for the 50s loop

  async function RobinPair() {
    const { state, saveCreds } = await useMultiFileAuthState(`./session`);
    try {
      const RobinPairWeb = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(
            state.keys,
            pino({ level: "fatal" }).child({ level: "fatal" })
          ),
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }).child({ level: "fatal" }),
        browser: Browsers.macOS("Safari"),
      });

      RobinPairWeb.ev.on("creds.update", saveCreds);

      RobinPairWeb.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "open") {
          clearInterval(interval); // stop the loop when paired

          await delay(5000); // optional delay

          const user_jid = jidNormalizedUser(RobinPairWeb.user.id);
          const auth_path = "./session/";

          function randomMegaId(length = 6, numberLength = 4) {
            const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
            let result = "";
            for (let i = 0; i < length; i++) {
              result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            const number = Math.floor(Math.random() * Math.pow(10, numberLength));
            return `${result}${number}`;
          }

          const mega_url = await upload(
            fs.createReadStream(auth_path + "creds.json"),
            `${randomMegaId()}.json`
          );

          const string_session = mega_url.replace("https://mega.nz/file/", "");
          const sid = `*ZapBot Session ID*\n\n👉 ${string_session} 👈\n\nPaste this in config.js\n\nNeed help? wa.me/message/+94705344946`;
          const mg = `🛑 *Do not share this code with anyone* 🛑`;

          await RobinPairWeb.sendMessage(user_jid, {
            text: sid,
          });

          await RobinPairWeb.sendMessage(user_jid, { text: mg });

          removeFile("./session");
          process.exit(0);
        }

        if (
          connection === "close" &&
          lastDisconnect?.error?.output?.statusCode !== 401
        ) {
          await delay(10000);
          RobinPair();
        }
      });

      if (!state.creds.registered) {
        // send pairing code initially
        const sendPairingCode = async () => {
          try {
            const code = await RobinPairWeb.requestPairingCode(num);
            console.log(`Pairing code generated: ${code}`);
            if (!res.headersSent) {
              res.write(JSON.stringify({ code }) + "\n");
            }
          } catch (err) {
            console.error("Pairing code error:", err.message);
          }
        };

        await sendPairingCode(); // first time
        interval = setInterval(sendPairingCode, 50000); // every 50 seconds
      }
    } catch (err) {
      console.error("RobinPair error:", err);
      exec("pm2 restart Robin-md");
      removeFile("./session");
      if (!res.headersSent) {
        res.status(503).send({ code: "Service Unavailable" });
      }
    }
  }

  await RobinPair();
});
