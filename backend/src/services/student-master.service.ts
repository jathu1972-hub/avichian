import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type { StudentMasterStatus, UserRole } from '@prisma/client';
import {
  AUTH_ERRORS,
  normalizeEmail,
  normalizeMobile,
  normalizeName,
  normalizeRegNo,
} from '@avichian/shared';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { decryptField, encryptField, hashValue } from '../utils/crypto.js';
import { AppError } from '../utils/errors.js';

export interface StudentMasterRecord {
  name: string;
  reg_no: string;
  mobile: string;
  email?: string;
  college_email?: string;
  department: string;
  year: number;
  section?: string;
  status?: StudentMasterStatus | 'ACTIVE' | 'INACTIVE';
  account_created?: boolean;
  role?: string;
  verified?: boolean;
}

interface StudentMasterFile {
  college?: string;
  department?: string;
  students?: StudentMasterRecord[];
  student_master?: StudentMasterRecord[];
}

function resolveCollegeEmail(record: StudentMasterRecord): string {
  return normalizeEmail(record.college_email ?? record.email ?? '');
}

function resolveStatus(record: StudentMasterRecord): StudentMasterStatus {
  const status = (record.status ?? 'ACTIVE').toString().toUpperCase();
  return status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
}

async function getOrCreateDepartment(name: string) {
  const normalized = name.trim();
  const existing = await prisma.department.findUnique({ where: { name: normalized } });
  if (existing) return existing;

  const codeBase = normalized.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() || 'DEPT';
  let code = codeBase;
  let suffix = 1;
  while (await prisma.department.findUnique({ where: { code } })) {
    code = `${codeBase}${suffix}`;
    suffix += 1;
  }

  return prisma.department.create({
    data: { name: normalized, code },
  });
}

function buildMasterData(record: StudentMasterRecord, departmentId: string) {
  const regNo = normalizeRegNo(record.reg_no);
  const name = normalizeName(record.name);
  const mobile = normalizeMobile(record.mobile);
  const email = resolveCollegeEmail(record);

  return {
    regNo,
    name,
    mobileHash: hashValue(mobile),
    mobileEnc: encryptField(mobile),
    email,
    departmentId,
    year: record.year,
    section: record.section?.trim() || null,
    status: resolveStatus(record),
    accountCreated: record.account_created ?? false,
    role: (record.role?.toUpperCase() as UserRole) ?? 'STUDENT',
    verified: record.verified ?? true,
  };
}

export async function importStudentMasterFromFile(
  filePath?: string,
): Promise<{ imported: number; skipped: number }> {
  const path = resolve(process.cwd(), filePath ?? env.studentMasterSeedPath);
  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch {
    throw new AppError(404, `Student master file not found at ${path}`);
  }

  const data = JSON.parse(raw) as StudentMasterFile;
  const students = data.students ?? data.student_master;
  if (!Array.isArray(students)) {
    throw new AppError(400, 'Invalid student master file format');
  }

  return importStudentMasterFromPayload(students);
}

const CSV_COLUMN_ALIASES: Record<string, string[]> = {
  reg_no: ['reg_no', 'regno', 'register number', 'register_number', 'reg no'],
  name: ['name', 'student name', 'student_name'],
  mobile: ['mobile', 'phone', 'mobile number', 'mobile_number'],
  email: ['email', 'college email', 'college_email'],
  department: ['department', 'dept'],
  year: ['year', 'batch'],
  section: ['section', 'sec'],
  status: ['status'],
  account_created: ['account_created', 'account created'],
  role: ['role'],
  verified: ['verified'],
};

function normalizeCsvHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[_\s]+/g, ' ');
}

function mapCsvRow(headers: string[], values: string[]): Partial<StudentMasterRecord> {
  const row: Record<string, string> = {};
  headers.forEach((header, index) => {
    row[normalizeCsvHeader(header)] = (values[index] ?? '').trim();
  });

  const record: Partial<StudentMasterRecord> = {};
  for (const [field, aliases] of Object.entries(CSV_COLUMN_ALIASES)) {
    const match = aliases.find((alias) => row[alias] !== undefined);
    if (!match) continue;
    const value = row[match];
    if (field === 'year') record.year = Number(value);
    else if (field === 'verified' || field === 'account_created') {
      (record as Record<string, boolean>)[field] = value.toLowerCase() === 'true';
    } else {
      (record as Record<string, string | number>)[field] = value;
    }
  }
  return record;
}

export function parseStudentMasterCsv(csvText: string): StudentMasterRecord[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new AppError(400, 'CSV must include a header row and at least one student');
  }

  const headers = lines[0].split(',').map((h) => h.trim());
  const students: StudentMasterRecord[] = [];

  for (const line of lines.slice(1)) {
    const values = line.split(',').map((v) => v.trim());
    const partial = mapCsvRow(headers, values);
    const email = partial.college_email ?? partial.email;
    if (
      !partial.reg_no ||
      !partial.name ||
      !partial.mobile ||
      !email ||
      !partial.department ||
      !partial.year
    ) {
      throw new AppError(400, `Invalid CSV row: ${line}`);
    }
    students.push({
      ...(partial as StudentMasterRecord),
      email,
    });
  }

  return students;
}

export async function importStudentMasterFromCsv(
  csvText: string,
  options?: { departmentScope?: string },
): Promise<{ imported: number; skipped: number }> {
  const students = parseStudentMasterCsv(csvText);
  return importStudentMasterFromPayload(students, options);
}

export async function importStudentMasterFromPayload(
  students: StudentMasterRecord[],
  options?: { departmentScope?: string },
): Promise<{ imported: number; updated: number; skipped: number }> {
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const scope = options?.departmentScope?.trim().toLowerCase();

  for (const record of students) {
    if (scope && record.department.trim().toLowerCase() !== scope) {
      throw new AppError(403, `Can only import students for department: ${options!.departmentScope}`);
    }

    const regNo = normalizeRegNo(record.reg_no);
    const department = await getOrCreateDepartment(record.department);
    const data = buildMasterData(record, department.id);

    const existing = await prisma.studentMaster.findUnique({ where: { regNo } });
    if (existing) {
      // Keep accountCreated if student already registered in the app
      await prisma.studentMaster.update({
        where: { regNo },
        data: {
          name: data.name,
          mobileHash: data.mobileHash,
          mobileEnc: data.mobileEnc,
          email: data.email,
          departmentId: data.departmentId,
          year: data.year,
          section: data.section,
          status: data.status,
          role: data.role,
          verified: data.verified,
        },
      });
      updated++;
      continue;
    }

    await prisma.studentMaster.create({ data });
    imported++;
  }

  return { imported, updated, skipped };
}

export async function getEligibleMasterByRegNo(regNoInput: string) {
  const regNo = normalizeRegNo(regNoInput);
  const [master, existingUser] = await Promise.all([
    prisma.studentMaster.findUnique({
      where: { regNo },
      include: { department: true },
    }),
    prisma.user.findUnique({ where: { regNo } }),
  ]);

  if (!master || !master.verified) {
    throw new AppError(404, AUTH_ERRORS.STUDENT_NOT_FOUND);
  }

  if (master.status !== 'ACTIVE') {
    throw new AppError(403, AUTH_ERRORS.STUDENT_INACTIVE);
  }

  if (master.accountCreated || existingUser) {
    throw new AppError(409, AUTH_ERRORS.ALREADY_REGISTERED);
  }

  return master;
}

export function assertMasterMobile(master: { mobileHash: string }, mobileInput: string) {
  const mobile = normalizeMobile(mobileInput);
  if (master.mobileHash !== hashValue(mobile)) {
    throw new AppError(400, AUTH_ERRORS.INVALID_MOBILE);
  }
  return mobile;
}

export async function verifyAgainstMaster(params: {
  regNo: string;
  name: string;
  mobile: string;
  email: string;
  department: string;
}) {
  const master = await getEligibleMasterByRegNo(params.regNo);
  const mobile = assertMasterMobile(master, params.mobile);
  const name = normalizeName(params.name);
  const email = normalizeEmail(params.email);
  const department = params.department.trim().replace(/\s+/g, ' ');

  if (
    master.name !== name ||
    master.email !== email ||
    master.department.name.toLowerCase() !== department.toLowerCase()
  ) {
    throw new AppError(404, AUTH_ERRORS.STUDENT_NOT_FOUND);
  }

  return { master, mobile };
}

export async function verifyMobileAgainstMaster(params: { regNo: string; mobile: string }) {
  const master = await getEligibleMasterByRegNo(params.regNo);
  const mobile = assertMasterMobile(master, params.mobile);
  return { master, mobile };
}

export async function markMasterAccountCreated(masterId: string) {
  await prisma.studentMaster.update({
    where: { id: masterId },
    data: { accountCreated: true },
  });
}

export function formatMasterLookup(master: {
  regNo: string;
  name: string;
  email: string;
  year: number;
  section: string | null;
  mobileEnc: string;
  department: { name: string };
}) {
  return {
    regNo: master.regNo,
    name: master.name,
    email: master.email,
    collegeEmail: master.email,
    department: master.department.name,
    year: master.year,
    section: master.section,
    mobileHint: `******${decryptField(master.mobileEnc).slice(-4)}`,
  };
}