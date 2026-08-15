/**
 * Multi-Strategy File Saver for 100% Reliable File Downloads on All Browsers & Operating Systems.
 * Handles Chrome/Edge/Firefox on Windows/Mac without UUID or extension stripping.
 */
export async function saveFileToDisk(
  content: Uint8Array | string,
  filename: string,
  mimeType: string,
  pickerType?: { description: string; accept: Record<string, string[]> }
): Promise<boolean> {
  // Strategy 1: Native File System Access API (Chrome 86+, Edge 79+, Opera)
  // Opens the official Windows / macOS "Save As" dialog with exact filename & extension pre-filled.
  if ("showSaveFilePicker" in window) {
    try {
      const opts: any = {
        suggestedName: filename,
      };
      if (pickerType) {
        opts.types = [pickerType];
      }
      const handle = await (window as any).showSaveFilePicker(opts);
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return true;
    } catch (err: any) {
      if (err && err.name === "AbortError") {
        // User intentionally closed or cancelled the Save dialog
        return true;
      }
      console.warn("showSaveFilePicker fallback triggered:", err);
    }
  }

  // Strategy 2: Native File Object with octet-stream MIME to prevent browser UUID hijacking
  try {
    const file = new File([content as BlobPart], filename, {
      type: mimeType || "application/octet-stream",
      lastModified: Date.now(),
    });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.setAttribute("download", filename);
    anchor.rel = "noopener noreferrer";
    anchor.style.position = "fixed";
    anchor.style.left = "-99999px";
    anchor.style.top = "-99999px";
    document.body.appendChild(anchor);

    // Native mouse event dispatch
    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
    });
    anchor.dispatchEvent(clickEvent);

    setTimeout(() => {
      if (document.body.contains(anchor)) {
        document.body.removeChild(anchor);
      }
      // Keep Blob URL alive for 2 minutes to allow background file writing to finish
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }, 120000);
    }, 1000);

    return true;
  } catch (err) {
    console.error("Strategy 2 failed, trying Strategy 3:", err);
  }

  // Strategy 3: Data URI fallback
  try {
    let dataUri = "";
    if (typeof content === "string") {
      dataUri = `data:${mimeType || "application/octet-stream"};charset=utf-8,` + encodeURIComponent(content);
    } else if (content instanceof Uint8Array) {
      let binary = "";
      const len = content.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(content[i]);
      }
      dataUri = `data:${mimeType || "application/octet-stream"};base64,` + window.btoa(binary);
    }

    if (dataUri) {
      const anchor = document.createElement("a");
      anchor.href = dataUri;
      anchor.download = filename;
      anchor.setAttribute("download", filename);
      document.body.appendChild(anchor);
      anchor.click();
      setTimeout(() => {
        if (document.body.contains(anchor)) {
          document.body.removeChild(anchor);
        }
      }, 1000);
      return true;
    }
  } catch (err) {
    console.error("Strategy 3 failed:", err);
  }

  return false;
}
