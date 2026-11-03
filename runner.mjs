import { pathToFileURL } from "node:url";

/** No dependencies, no retries, no customer data, and probe-only by default. */
export async function runPostventa({ env = process.env, request = globalThis.fetch } = {}) {
  const mode = env.POSTVENTA_MODE ?? "probe";
  if (!["probe", "dispatch"].includes(mode)) {
    throw new Error("POSTVENTA_MODE debe ser probe o dispatch.");
  }
  const token = env.POSTVENTA_SERVICE_TOKEN;
  if (!token || token.length < 32 || token.length > 300 || /[\r\n]/.test(token)) {
    throw new Error("Falta un POSTVENTA_SERVICE_TOKEN válido en Secrets.");
  }
  let origin;
  try {
    origin = new URL(env.POSTVENTA_PUBLIC_ORIGIN);
  } catch {
    throw new Error("Falta un origen HTTPS de producción válido.");
  }
  if (origin.protocol !== "https:" || origin.username || origin.password ||
      origin.pathname !== "/" || origin.search || origin.hash ||
      origin.hostname.endsWith(".replit.dev") || origin.hostname === "localhost") {
    throw new Error("Usá únicamente el origen HTTPS canónico de producción.");
  }
  let response;
  try {
    response = await request(new URL("/api/services/postventa/run", origin), {
      method: "POST",
      redirect: "error",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(mode === "probe" ? { probe: true } : {}),
      signal: AbortSignal.timeout(240_000),
    });
  } catch {
    // A lost response can follow a committed dispatch: never retry automatically.
    throw new Error("No se confirmó la conexión. Revisá el CRM antes de reintentar.");
  }
  if (!response.ok) {
    throw new Error(`El CRM respondió HTTP ${response.status}. No se reintentó.`);
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("El CRM no devolvió una confirmación JSON válida. No se reintentó.");
  }
  if (mode === "probe") {
    if (result?.probe !== true || result?.automaticDispatch !== false) {
      throw new Error("El CRM no confirmó una sonda sin despacho. No se reintentó.");
    }
    return { success: true, mode, processed: 0, automaticDispatch: false };
  }
  if (!Number.isInteger(result?.processed) || result.processed < 0 ||
      result.processed > 50 || typeof result.disabled !== "boolean") {
    throw new Error("El CRM no confirmó el resultado del despacho. Revisá su estado.");
  }
  return { success: true, mode, processed: result.processed, disabled: result.disabled };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await runPostventa()));
  } catch (error) {
    // Only fixed messages above; never print an upstream body or fetch exception.
    console.error(error.message);
    process.exitCode = 1;
  }
}
