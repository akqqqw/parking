/**
 * Минимальные типы для `pngjs`: библиотека нужна только тестам ассетов, а
 * собственных деклараций не содержит.
 */
declare module 'pngjs' {
  export interface PngData {
    width: number;
    height: number;
    data: Buffer;
  }
  export class PNG {
    width: number;
    height: number;
    data: Buffer;
    static sync: {
      read(buffer: Buffer | Uint8Array, options?: Record<string, unknown>): PNG & PngData;
      write(png: PNG | PngData, options?: Record<string, unknown>): Buffer;
    };
  }
}
