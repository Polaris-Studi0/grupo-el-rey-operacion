import { createClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const SUPABASE_URL = "https://xmfltwhgvoaleejatxtg.supabase.co";

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

function cleanSecret(value) {
  return value
    .replaceAll("\u001b[200~", "")
    .replaceAll("\u001b[201~", "")
    .replaceAll(/\s/g, "")
    .trim();
}

function password() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return Array.from({ length: 16 }, () => chars[randomInt(chars.length)]).join("");
}

async function main() {
  const rl = createInterface({ input, output });
  const answer = (await rl.question("Correo administrador [contact@polaris-studio.tech]: ")).trim();
  rl.close();
  const email = (answer || "contact@polaris-studio.tech").toLowerCase();
  const secret = cleanSecret(await hiddenQuestion("Nueva llave sb_secret de Supabase (entrada oculta): "));
  if (!secret.startsWith("sb_secret_")) throw new Error("La llave debe comenzar por sb_secret_.");

  const supabase = createClient(SUPABASE_URL, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`Supabase rechazó la llave: ${error.message}`);
  const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
  if (!user) throw new Error(`No existe un usuario con el correo ${email}.`);

  const newPassword = password();
  const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
    password: newPassword,
    email_confirm: true,
  });
  if (updateError) throw new Error(`No se pudo cambiar la contraseña: ${updateError.message}`);

  mkdirSync("private", { recursive: true });
  const path = "private/contraseña-admin-actual.txt";
  writeFileSync(path, `Correo: ${email}\nContraseña: ${newPassword}\n`, { mode: 0o600 });
  console.log(`\n✓ Contraseña restablecida. Credencial guardada en ${path}\n`);
}

main().catch((error) => {
  console.error(`\nError: ${error.message}\n`);
  process.exitCode = 1;
});
