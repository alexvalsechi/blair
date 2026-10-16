const path = require("node:path");
const packageJson = require("./package.json");
const branding = require("./branding.json");

const appName = String(branding.appName ?? "Persona").trim();
const normalizedName = appName.replace(/\.exe$/i, "").toLowerCase();
const reservedWindowsNames = new Set([
  "svchost",
  "services",
  "winlogon",
  "wininit",
  "csrss",
  "smss",
  "lsass",
  "dwm",
  "taskmgr",
  "runtimebroker",
  "spoolsv",
  "system",
]);

if (!/^[a-z0-9][a-z0-9 ._-]{0,39}$/i.test(appName) || appName.endsWith(".")) {
  throw new Error(
    'branding.json: "appName" deve ter até 40 caracteres e usar apenas letras, números, espaço, ponto, hífen ou sublinhado.',
  );
}

if (reservedWindowsNames.has(normalizedName)) {
  throw new Error(
    `branding.json: "${appName}" é um nome reservado de processo do Windows. Escolha um nome próprio para o aplicativo.`,
  );
}

const windowsIcon = path.resolve(__dirname, branding.windowsIcon ?? "build/icon.svg");

module.exports = {
  ...packageJson.build,
  productName: appName,
  executableName: appName,
  artifactName: "${productName}.${version}.${ext}",
  win: {
    ...packageJson.build.win,
    icon: windowsIcon,
  },
};
