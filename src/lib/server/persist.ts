import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const DATA_DIR = join(process.env.HOME || '/tmp', '.altera-data')

function ensureDir() {
	if (!existsSync(DATA_DIR)) {
		mkdirSync(DATA_DIR, { recursive: true })
	}
}

export function loadJson<T>(filename: string, fallback: T): T {
	ensureDir()
	const path = join(DATA_DIR, filename)
	if (!existsSync(path)) return fallback
	try {
		return JSON.parse(readFileSync(path, 'utf-8'))
	} catch {
		const backup = path + '.bak'
		if (existsSync(backup)) {
			try {
				return JSON.parse(readFileSync(backup, 'utf-8'))
			} catch {
				return fallback
			}
		}
		return fallback
	}
}

export function saveJson(filename: string, data: unknown): void {
	ensureDir()
	const path = join(DATA_DIR, filename)
	const tmp = path + '.tmp'
	const backup = path + '.bak'
	const json = JSON.stringify(data, null, 2)
	writeFileSync(tmp, json)
	if (existsSync(path)) {
		renameSync(path, backup)
	}
	renameSync(tmp, path)
}
