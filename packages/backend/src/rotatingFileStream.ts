import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync, type WriteStream } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { Writable } from 'node:stream';

interface RotatingFileStreamOptions {
    filePath: string;
    maxFileSizeBytes: number;
    maxTotalSizeBytes: number;
}

interface LogFileInfo {
    path: string;
    size: number;
    isCurrent: boolean;
    mtimeMs: number;
}

export class RotatingFileStream extends Writable {
    private readonly filePath: string;
    private readonly directoryPath: string;
    private readonly currentFileName: string;
    private readonly archiveFilePrefix: string;
    private readonly archiveFileSuffix: string;
    private readonly maxFileSizeBytes: number;
    private readonly maxTotalSizeBytes: number;

    private currentSizeBytes: number;
    private totalSizeBytes: number;
    private archiveSequence = 0;
    private currentStream: WriteStream;
    private pendingWrite: Promise<void> = Promise.resolve();

    constructor(options: RotatingFileStreamOptions) {
        super();

        this.filePath = resolve(options.filePath);
        this.directoryPath = dirname(this.filePath);
        this.currentFileName = basename(this.filePath);
        this.maxFileSizeBytes = options.maxFileSizeBytes;
        this.maxTotalSizeBytes = options.maxTotalSizeBytes;

        const extension = extname(this.currentFileName);
        const stem = extension ? basename(this.currentFileName, extension) : this.currentFileName;
        this.archiveFilePrefix = `${stem}.`;
        this.archiveFileSuffix = extension;

        mkdirSync(this.directoryPath, { recursive: true });

        this.currentSizeBytes = existsSync(this.filePath) ? statSync(this.filePath).size : 0;
        this.totalSizeBytes = this.scanLogFiles().reduce((total, file) => total + file.size, 0);
        this.currentStream = createWriteStream(this.filePath, { flags: 'a' });
    }

    override _write(chunk: string | Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);

        this.pendingWrite = this.pendingWrite.then(async () => {
            await this.writeChunk(buffer);
        });

        this.pendingWrite.then(
            () => callback(),
            (error: unknown) => callback(asError(error))
        );
    }

    override _final(callback: (error?: Error | null) => void): void {
        this.pendingWrite = this.pendingWrite.then(async () => {
            await this.closeCurrentStream();
        });

        this.pendingWrite.then(
            () => callback(),
            (error: unknown) => callback(asError(error))
        );
    }

    override _destroy(error: Error | null, callback: (error: Error | null) => void): void {
        this.currentStream.destroy();
        callback(error);
    }

    private async writeChunk(buffer: Buffer): Promise<void> {
        if (this.currentSizeBytes > 0 && this.currentSizeBytes + buffer.length > this.maxFileSizeBytes) {
            await this.rotateCurrentFile();
        }

        await this.writeToCurrentStream(buffer);
        this.currentSizeBytes += buffer.length;
        this.totalSizeBytes += buffer.length;

        if (this.totalSizeBytes > this.maxTotalSizeBytes) {
            this.enforceTotalSizeLimit();
        }
    }

    private async rotateCurrentFile(): Promise<void> {
        if (this.currentSizeBytes === 0) {
            return;
        }

        await this.closeCurrentStream();

        renameSync(this.filePath, this.createArchivePath());

        this.currentSizeBytes = 0;
        this.currentStream = createWriteStream(this.filePath, { flags: 'a' });
        this.enforceTotalSizeLimit();
    }

    private createArchivePath(): string {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sequence = String(this.archiveSequence++).padStart(3, '0');
        const archiveFileName = `${this.archiveFilePrefix}${timestamp}-${sequence}${this.archiveFileSuffix}`;
        return join(this.directoryPath, archiveFileName);
    }

    private async writeToCurrentStream(buffer: Buffer): Promise<void> {
        await new Promise<void>((resolveWrite, rejectWrite) => {
            this.currentStream.write(buffer, (error) => {
                if (error) {
                    rejectWrite(error);
                    return;
                }

                resolveWrite();
            });
        });
    }

    private async closeCurrentStream(): Promise<void> {
        await new Promise<void>((resolveClose, rejectClose) => {
            const stream = this.currentStream;

            const onError = (error: Error) => {
                stream.off('finish', onFinish);
                rejectClose(error);
            };

            const onFinish = () => {
                stream.off('error', onError);
                resolveClose();
            };

            stream.once('error', onError);
            stream.once('finish', onFinish);
            stream.end();
        });
    }

    private enforceTotalSizeLimit(): void {
        const logFiles = this.scanLogFiles();
        let totalSizeBytes = logFiles.reduce((total, file) => total + file.size, 0);
        if (totalSizeBytes <= this.maxTotalSizeBytes) {
            this.totalSizeBytes = totalSizeBytes;
            return;
        }

        const removableFiles = logFiles
            .filter((file) => !file.isCurrent)
            .sort((left, right) => left.mtimeMs - right.mtimeMs || left.path.localeCompare(right.path));

        for (const file of removableFiles) {
            if (totalSizeBytes <= this.maxTotalSizeBytes) {
                break;
            }

            unlinkSync(file.path);
            totalSizeBytes -= file.size;
        }

        this.totalSizeBytes = totalSizeBytes;
    }

    private scanLogFiles(): LogFileInfo[] {
        return readdirSync(this.directoryPath)
            .filter((fileName) => fileName === this.currentFileName || this.isArchiveFileName(fileName))
            .map((fileName) => {
                const filePath = join(this.directoryPath, fileName);
                const stats = statSync(filePath);

                return {
                    path: filePath,
                    size: stats.size,
                    isCurrent: fileName === this.currentFileName,
                    mtimeMs: stats.mtimeMs
                };
            });
    }

    private isArchiveFileName(fileName: string): boolean {
        return fileName.startsWith(this.archiveFilePrefix) && fileName.endsWith(this.archiveFileSuffix);
    }
}

function asError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}
