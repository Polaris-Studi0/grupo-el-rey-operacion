import { stdin as input, stdout as output } from "node:process";

const PROJECT_REF = "xmfltwhgvoaleejatxtg";
const ENDPOINT = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;

function hiddenQuestion(prompt) {
  return new Promise((resolve, reject) => {
    if (!input.isTTY) return reject(new Error("Ejecuta este comando en una terminal interactiva."));
    output.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    let value = "";

    function finish(error) {
      input.setRawMode(false);
      input.pause();
      input.off("data", onData);
      output.write("\n");
      if (error) reject(error);
      else resolve(value);
    }

    function onData(chunk) {
      for (const character of chunk) {
        if (character === "\u0003") return finish(new Error("Operación cancelada."));
        if (character === "\r" || character === "\n") return finish();
        if (character === "\u007f") value = value.slice(0, -1);
        else value += character;
      }
    }
    input.on("data", onData);
  });
}

function clean(value) {
  return value
    .replaceAll("\u001b[200~", "")
    .replaceAll("\u001b[201~", "")
    .replaceAll(/\s/g, "")
    .trim();
}

async function main() {
  console.log("\nCorrección de acceso por correo — Grupo El Rey\n");
  const token = clean(await hiddenQuestion("Token personal de Supabase (entrada oculta): "));
  if (!token) throw new Error("No se recibió ningún token.");

  const response = await fetch(ENDPOINT, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      external_email_enabled: true,
      disable_signup: true,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || body.error || `Supabase respondió HTTP ${response.status}.`);
  }
  if (body.external_email_enabled !== true || body.disable_signup !== true) {
    throw new Error("Supabase respondió, pero la configuración no quedó como se esperaba.");
  }

  console.log("\n✓ Inicio de sesión por correo: ACTIVADO");
  console.log("✓ Registro público de usuarios: BLOQUEADO");
  console.log("\nYa puedes revocar el token personal utilizado.\n");
}

main().catch((error) => {
  console.error(`\nError: ${error.message}\n`);
  process.exitCode = 1;
});
