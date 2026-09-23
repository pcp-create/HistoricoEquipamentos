export const taskAttachmentExtensions = [
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".pps",
  ".ppsx",
] as const;
export const taskAttachmentAccept = taskAttachmentExtensions.join(",");
export const taskAttachmentTypeMessage =
  "Envie PDF, Word (.doc, .docx), Excel (.xls, .xlsx) ou PowerPoint (.ppt, .pptx, .pps, .ppsx).";
export function allowedTaskAttachment(filename: string): boolean {
  const extension = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return taskAttachmentExtensions.some((allowed) => allowed === extension);
}

export function taskAttachmentMime(filename: string): string {
  const extension = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  const types: Record<string, string> = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pps": "application/vnd.ms-powerpoint",
    ".pptx":
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".ppsx":
      "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
  };
  return types[extension] || "application/octet-stream";
}
