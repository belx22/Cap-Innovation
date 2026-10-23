const FILE_UPLOAD_FLOW_URL = import.meta.env.VITE_FILE_UPLOAD_FLOW_URL ||
  "https://default2bd82a682c7d4c43b0809b064410f6.cf.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/19/workflows/2d7e78aa76e04800a659ac7f02a289b4/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=JUNsf3zLqLIibc-a6oU3y2BSQKPaHfM0_rBeR4vvsY0";

export interface UploadableFile {
  name: string;
  size: string;
  contentBase64: string;
}

export interface UploadResult {
  success?: boolean;
  url?: string;
  path?: string;
  fullPath?: string;
  fileName?: string;
  name?: string;
}

/** Construit un chemin SharePoint sûr pour éviter les caractères interdits dans les dossiers. */
export function sharePointFolderPath(...parts: string[]): string {
  const safe = parts
    .map((part) => String(part || "").trim().replace(/[\\/:*?"<>|#%{}~&]/g, "-").replace(/\s+/g, " "))
    .filter(Boolean);
  return ["/Documents partages", ...safe].join("/");
}

/** URL directe du fichier dans la bibliothèque SharePoint, jamais l'URL DispForm de la liste 13_Documents. */
export function sharePointFileUrl(folderPath: string, fileName: string): string {
  const site = "https://afrilandfirstbankcmr.sharepoint.com/sites/Cap-Innovation";
  const path = folderPath.split("/").filter(Boolean).map((part) => encodeURIComponent(part)).join("/");
  return `${site}/${path}/${encodeURIComponent(fileName)}`;
}

/** Utilise le chemin réellement créé par Power Automate quand il est retourné. */
export function uploadedFileUrl(folderPath: string, originalName: string, result?: UploadResult): string {
  const returnedUrl = result?.url;
  if (returnedUrl && /^https?:\/\//i.test(returnedUrl)) return returnedUrl;

  const returnedPath = result?.fullPath || result?.path;
  if (returnedPath) {
    if (/^https?:\/\//i.test(returnedPath)) return returnedPath;
    const site = "https://afrilandfirstbankcmr.sharepoint.com/sites/Cap-Innovation";
    const normalized = returnedPath.startsWith("/") ? returnedPath : `/${returnedPath}`;
    return `${site}${normalized.split("/").map((part, index) => index === 0 ? part : encodeURIComponent(part)).join("/")}`;
  }

  return sharePointFileUrl(folderPath, result?.fileName || result?.name || originalName);
}

export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function uploadFileToSharePoint(file: UploadableFile, operationId: number, deposerPar: string, folderPath?: string): Promise<UploadResult> {
  const response = await fetch(FILE_UPLOAD_FLOW_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bibliotheque: folderPath || "/Documents partages",
      fileName: file.name,
      fileContent: file.contentBase64,
      operationId,
      deposePar: deposerPar,
    }),
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Flux de stockage HTTP ${response.status}${details ? ` : ${details.slice(0, 180)}` : ""}`);
  }
  const payload = await response.json().catch(() => ({}));
  return payload && typeof payload === "object" ? payload as UploadResult : {};
}
