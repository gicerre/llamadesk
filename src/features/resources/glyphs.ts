import {
  CircleAlert,
  File,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderGit2,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import type { PathInfo } from '@/types/generated/PathInfo';

/** Il glifo di un percorso dipende da cio' che il disco dice di lui. */
const CODE = new Set([
  'ts',
  'tsx',
  'js',
  'json',
  'rs',
  'java',
  'kt',
  'py',
  'sql',
  'xml',
  'yml',
  'yaml',
  'bpmn',
  'sh',
  'ps1',
  'cs',
  'go',
]);
const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp']);
const SHEET = new Set(['xlsx', 'xls', 'csv', 'ods']);
const TEXT = new Set(['pdf', 'doc', 'docx', 'md', 'txt', 'rtf', 'odt', 'pptx']);

export function fileGlyph(info: PathInfo | undefined): LucideIcon {
  if (!info) return Folder;
  switch (info.kind) {
    case 'repository':
      return FolderGit2;
    case 'directory':
      return Folder;
    case 'missing':
      return CircleAlert;
    case 'unavailable':
      return WifiOff;
    case 'file': {
      const extension = info.extension ?? '';
      if (CODE.has(extension)) return FileCode;
      if (IMAGE.has(extension)) return FileImage;
      if (SHEET.has(extension)) return FileSpreadsheet;
      if (TEXT.has(extension)) return FileText;
      return File;
    }
  }
}
