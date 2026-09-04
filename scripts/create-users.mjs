import { createClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const SUPABASE_URL = "https://xmfltwhgvoaleejatxtg.supabase.co";
const branches = [
  ["b1", "aures", "Caja Robledo Aures"],
  ["b2", "diamante80", "Caja Robledo Diamante - Calle 80"],
  ["b3", "santacruz", "Caja Santa Cruz"],
  ["b4", "sangabriel", "Caja San Gabriel, Itagüí"],
  ["b5", "diamante85", "Caja Robledo Diamante - Diagonal 85"],
  ["b6", "floresta", "Caja Floresta"],
  ["b7", "la80", "Caja La 80"],
  ["b8", "laestrella", "Caja La Estrella"],
  ["b9", "campovaldez", "Caja Campo Valdez"],
  ["b10", "prado", "Caja San Antonio de Prado"],
];

function hiddenQuestion(prompt) {
  return new Promise((resolve, reject) => {
    if (!input.isTTY) {
      reject(new Error("Ejecuta este comando en una terminal interactiva."));
      return;
    }
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
        if (character === "\u0003") {
          finish(new Error("Operación cancelada."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f") value = value.slice(0, -1);
        else value += character;
      }
    }
    input.on("data", onData);
  });
}

function password() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from({ length: 16 }, () => chars[randomInt(chars.length)]).join("");
}

function csv(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function main() {
  const rl = createInterface({ input, output });
  console.log("\nConfiguración inicial de usuarios — Grupo El Rey\n");
  const adminEmail = (await rl.question("Correo del administrador: ")).trim().toLowerCase();
  const domain = (await rl.question("Dominio para las cajas (ej. grupoelrey.com): ")).trim().toLowerCase();
  rl.close();

  if (!/^\S+@\S+\.\S+$/.test(adminEmail)) throw new Error("El correo del administrador no es válido.");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) throw new Error("El dominio no es válido.");

  const secret = (await hiddenQuestion("Nueva llave sb_secret de Supabase (entrada oculta): "))
    .replaceAll("\u001b[200~", "")
    .replaceAll("\u001b[201~", "")
    .replaceAll(/\s/g, "")
    .trim();
  if (!secret.startsWith("sb_secret_")) throw new Error("Debes usar una llave nueva que empiece por sb_secret_.");

  const supabase = createClient(SUPABASE_URL, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: keyError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (keyError) {
    throw new Error(`Supabase rechazó la llave antes de crear usuarios: ${keyError.message}`);
  }
  console.log("✓ Llave administrativa validada\n");
  const accounts = [
    { email: adminEmail, name: "Administrador Grupo El Rey", role: "admin", branchId: null },
    ...branches.map(([branchId, slug, name]) => ({
      email: `caja.${slug}@${domain}`,
      name,
      role: "cashier",
      branchId,
    })),
  ];

  const rows = [["tipo", "sede", "correo", "contraseña inicial", "resultado"]];
  for (const account of accounts) {
    const initialPassword = password();
    const { data, error } = await supabase.auth.admin.createUser({
      email: account.email,
      password: initialPassword,
      email_confirm: true,
      user_metadata: { full_name: account.name },
    });

    if (error) {
      rows.push([account.role, account.name, account.email, "", `NO CREADO: ${error.message}`]);
      console.log(`✗ ${account.email}: ${error.message}`);
      continue;
    }

    const { error: profileError } = await supabase.from("profiles").update({
      full_name: account.name,
      role: account.role,
      branch_id: account.branchId,
      active: true,
    }).eq("id", data.user.id);

    if (profileError) {
      rows.push([account.role, account.name, account.email, initialPassword, `CUENTA CREADA; PERFIL PENDIENTE: ${profileError.message}`]);
      console.log(`△ ${account.email}: cuenta creada; perfil pendiente`);
    } else {
      rows.push([account.role, account.name, account.email, initialPassword, "CREADO"]);
      console.log(`✓ ${account.email}`);
    }
  }

  mkdirSync("private", { recursive: true });
  const timestamp = new Date().toISOString().replaceAll(":", "-").replace(".", "-");
  const path = `private/credenciales-${timestamp}.csv`;
  writeFileSync(path, rows.map((row) => row.map(csv).join(",")).join("\n"), { mode: 0o600 });
  console.log(`\nResultado guardado localmente en ${path}`);
  console.log("Este archivo está excluido de Git. Entrégalo de forma privada y bórralo cuando ya no sea necesario.\n");
}

main().catch((error) => {
  console.error(`\nError: ${error.message}\n`);
  process.exitCode = 1;
});
