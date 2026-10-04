import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { handleChat } from "./api/chat";

function groqDevPlugin(): Plugin {
  return {
    name: "groq-dev",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split("?")[0];
        if (path !== "/api/chat") {
          next();
          return;
        }

        const chunks: Uint8Array[] = [];
        for await (const chunk of req) {
          chunks.push(
            typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk)
          );
        }
        const total = chunks.reduce((sum, item) => sum + item.byteLength, 0);
        const raw = new Uint8Array(total);
        let offset = 0;
        for (const item of chunks) {
          raw.set(item, offset);
          offset += item.byteLength;
        }
        const host = req.headers.host ?? "localhost:5173";
        const url = `http://${host}${req.url ?? "/api/chat"}`;
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === "string") headers.set(key, value);
          else if (Array.isArray(value)) headers.set(key, value.join(", "));
        }

        const request = new Request(url, {
          method: req.method ?? "POST",
          headers,
          body: req.method === "GET" || req.method === "HEAD" ? undefined : raw,
        });

        try {
          const response = await handleChat(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            res.setHeader(key, value);
          });
          if (!response.body) {
            res.end();
            return;
          }
          const reader = response.body.getReader();
          const pump = async () => {
            const { done, value } = await reader.read();
            if (done) {
              res.end();
              return;
            }
            res.write(value);
            await pump();
          };
          await pump();
        } catch (err) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(
            JSON.stringify({
              error: "dev_proxy",
              message:
                err instanceof Error
                  ? err.message
                  : "Yanıt şu an üretilemedi. Biraz sonra tekrar deneyin.",
            })
          );
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (env.GROQ_API_KEY) process.env.GROQ_API_KEY = env.GROQ_API_KEY;

  return {
    plugins: [react(), groqDevPlugin()],
    server: {
      host: true,
      port: 5173,
    },
  };
});
