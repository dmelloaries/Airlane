/**
 * Universal File Saver for 100% Reliable File Downloads across all browsers & operating systems.
 * Direct Blob download without modal blocking or file system permission hangs.
 */
export async function saveFileToDisk(
  content: Uint8Array | string,
  filename: string,
  mimeType: string,
  _pickerType?: { description: string; accept: Record<string, string[]> }
): Promise<boolean> {
  try {
    const isBinary = content instanceof Uint8Array;
    const blob = isBinary
      ? new Blob([content as BlobPart], { type: mimeType || "application/pdf" })
      : new Blob([content as BlobPart], { type: mimeType || "application/json" });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();

    setTimeout(() => {
      if (document.body.contains(anchor)) {
        document.body.removeChild(anchor);
      }
      URL.revokeObjectURL(url);
    }, 2000);

    return true;
  } catch (err) {
    console.error("Direct Blob download failed, attempting Data URI fallback:", err);
    try {
      let dataUri = "";
      if (typeof content === "string") {
        dataUri =
          `data:${mimeType || "application/octet-stream"};charset=utf-8,` +
          encodeURIComponent(content);
      } else if (content instanceof Uint8Array) {
        let binary = "";
        const len = content.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(content[i]);
        }
        dataUri =
          `data:${mimeType || "application/octet-stream"};base64,` +
          window.btoa(binary);
      }

      if (dataUri) {
        const anchor = document.createElement("a");
        anchor.href = dataUri;
        anchor.download = filename;
        anchor.style.display = "none";
        document.body.appendChild(anchor);
        anchor.click();
        setTimeout(() => {
          if (document.body.contains(anchor)) {
            document.body.removeChild(anchor);
          }
        }, 2000);
        return true;
      }
    } catch (e) {
      console.error("Data URI fallback failed:", e);
    }
    return false;
  }
}
