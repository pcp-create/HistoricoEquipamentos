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
