import axios from "axios";

enum UStarTypeFlag {
  NormalFile = 0,
  HardLink = 1,
  SymbolicLink = 2,
  CharacterSpecial = 3,
  BlockSpecial = 4,
  Directory = 5,
  Fifo = 6,
  ContiguousFile = 7,
  GlobalExtendedHeader = 0x67,
  ExtendedHeader = 0x78,
}

type PumpFn = () => Promise<void | PumpFn>;

interface UStarHeader {
  // 0, 100
  name: string;
  // 100, 8
  /**
   * @example 0o644
   */
  mode?: number;
  // 108, 8
  uid?: number;
  // 116, 8
  gid?: number;
  // 124, 12
  size: number;
  // 136, 12
  mtime?: Date;
  // 148, 8
  checksum: string;
  // 156, 1
  fileType: UStarTypeFlag;
  // 157, 100
  linkName?: string;
  // 257, 6
  /**
   * @default "ustar"
   */
  magic: string;
  // 263, 2
  /**
   * @default "00"
   */
  version: string;
  // 265, 32
  uname?: string;
  // 297, 32
  gname?: string;
  // 329, 8
  devmajor?: number;
  // 337, 8
  devminor?: number;
  // 345, 155
  prefix?: string;
}

interface TarHeaderOptions extends Omit<UStarHeader,"checksum"| "magic" | "version"> {}

/**
 * @description create a new Tar buffer
 */
class Tar implements Blob {
  #files: {
    stream: () => ReadableStream<Uint8Array>;
    options: TarHeaderOptions;
  }[];
  #stream: TransformStream<Uint8Array, Uint8Array>;

  type = "application/tar";

  constructor() {
    this.#files = [];
    this.#stream = new TransformStream({
      start: (controller) => {
        let cursor = 0;

        // start streaming
        const pump: PumpFn = async () => {
          if (this.#files.length === cursor - 1) {
            controller.terminate();
            return;
          }

          console.log("pumping");

          const file = this.#files[cursor++];

          await this.#writeFile(file);

          // next
          return pump();
        };

        return pump();
      },
      flush: (controller) => {
        /* do any destructor work here */
      },
    });
  }

  async #getFullBuffer(): Promise<Uint8Array> {
    const reader = this.#stream.readable.getReader();
    let done: boolean;
    let buf: Uint8Array = new Uint8Array(0);

    do {
      const result = await reader.read();
      done = result.done;
      if (result.value) buf = new Uint8Array([...buf, ...result.value]);
    } while (!done);

    return buf;
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    const buf = await this.#getFullBuffer();

    return buf;
  }

  get size() {
    const size = this.#files.reduce((acc, file) => {
      return acc + file.size + this.#getHeaderSize(file);
    }, 0);

    return size;
  }

  slice(start?: number, end?: number, contentType?: string): Blob {
    throw new Error("Method not implemented.");

    // return new Blob([this.#buffer.slice(start, end)], { type: contentType });
  }

  stream(): ReadableStream<Uint8Array> {
    return this.#stream.readable;
  }
  async text(): Promise<string> {
    const buf = await this.#getFullBuffer();

    return buf.toString();
  }

  append(stream: ReadableStream<Uint8Array>, options: TarHeaderOptions) {
    this.#files.push({ stream: () => stream, options });
  }
  appendFile(file: File, options?: Omit<TarHeaderOptions, "name" | "size"| "fileType">) {
    const name = file.webkitRelativePath ? file.webkitRelativePath : file.name;

    options = { ...options, name, size: file.size };

    this.#files.push({
      stream: () => file.stream(),
      options:,
    });
  }
  extract() {}
  list() {}

  #getHeaderSize(file: File, options?: TarHeaderOptions): number {
    const size = 512;

    return size;
  }

  #valueToString(value: string | number, length: number): string {
    value = value.toString(8);
    const str = value.padEnd(length, "\0");

    return str;
  }

  #writeToBuffer(
    buf: Uint8Array,
    offset: number,
    length: number,
    value: string | number
  ) {
    const val = this.#valueToString(value, length);

    const end = offset + val.length;

    for (let i = offset; i < end; i++) {
      buf[i] = val.charCodeAt(i - offset);
    }
  }

  #getFileHeader(file: File): Uint8Array {
    const buf = new Uint8Array(512);

    this.#writeToBuffer(buf, 0, 100, file.webkitRelativePath);

    return buf;
  }

  async #writeFile(file: File) {
    const writable = this.#stream.writable;

    await writable.getWriter().write(this.#getFileHeader(file));

    await file.stream().pipeTo(writable);
  }
}

const test = () => {
  const formData = new FormData();
  const tar = new Tar();

  const file1 = new File(["hello"], "hello.txt");
  Object.defineProperty(file1, "webkitRelativePath", "hello.txt");
  tar.append(file1);

  const file2 = new File(["world"], "world.txt");
  Object.defineProperty(file2, "webkitRelativePath", "dir2/world.txt");
  tar.append(file2);

  formData.append("tar", tar);
  axios.post("/api/tar", formData);
};
