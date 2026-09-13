/**
 * Bulk student import for Super Admin — creates real User + Profile + StudentMaster rows.
 */
import {
  isValidEmail,
  isValidRegNo,
  normalizeEmail,
  normalizeName,
  normalizeRegNo,
} from '@avichian/shared';
import { prisma } from '../../lib/prisma.js';
import { encryptField, hashValue } from '../../utils/crypto.js';
import { assertStrongPassword, hashPassword } from '../../utils/password.js';
import { AppError } from '../../utils/errors.js';
import { writeAuditLog } from '../audit.service.js';
import { env } from '../../config/env.js';

export type ImportRowInput = {
  rowNumber: number;
  name?: string;
  regNo?: string;
  email?: string;
  mobile?: string;
};

export type ValidatedImportRow = {
  rowNumber: number;
  name: string;
  regNo: string;
  email: string;
  mobile: string | null;
  status: 'valid' | 'duplicate' | 'invalid';
  reason?: string;
};

const NAME_ALIASES = [
  'name',
  'student name',
  'full name',
  'student_name',
  'fullname',
  'student',
];
const REG_ALIASES = [
  'roll no',
  'roll number',
  'roll_no',
  'rollnumber',
  'registration number',
  'register number',
  'reg no',
  'reg_no',
  'regno',
  'student id',
  'student_id',
  'id',
];
const EMAIL_ALIASES = ['email', 'college email', 'e-mail', 'mail'];
const MOBILE_ALIASES = ['mobile', 'phone', 'phone number', 'mobile number', 'contact'];

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

export function detectColumnMapping(headers: string[]): {
  nameCol: number | null;
  regCol: number | null;
  emailCol: number | null;
  mobileCol: number | null;
  confidence: 'high' | 'medium' | 'low';
} {
  const normalized = headers.map(normHeader);
  const find = (aliases: string[]) => {
    const i = normalized.findIndex((h) => aliases.includes(h));
    return i >= 0 ? i : null;
  };
  const nameCol = find(NAME_ALIASES);
  const regCol = find(REG_ALIASES);
  const emailCol = find(EMAIL_ALIASES);
  const mobileCol = find(MOBILE_ALIASES);
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (nameCol != null && regCol != null) confidence = 'high';
  else if (nameCol != null || regCol != null) confidence = 'medium';
  return { nameCol, regCol, emailCol, mobileCol, confidence };
}

export function rowsFromMatrix(
  headers: string[],
  matrix: string[][],
  mapping?: { nameCol: number; regCol: number; emailCol?: number | null; mobileCol?: number | null },
): ImportRowInput[] {
  const detected = detectColumnMapping(headers);
  const nameCol = mapping?.nameCol ?? detected.nameCol;
  const regCol = mapping?.regCol ?? detected.regCol;
  const emailCol = mapping?.emailCol ?? detected.emailCol;
  const mobileCol = mapping?.mobileCol ?? detected.mobileCol;
  if (nameCol == null || regCol == null) {
    throw new AppError(400, 'Could not detect Name and Roll Number columns', 'COLUMN_MAP_REQUIRED');
  }

  return matrix.map((row, idx) => ({
    rowNumber: idx + 2, // header is row 1
    name: row[nameCol]?.trim() || undefined,
    regNo: row[regCol]?.trim() || undefined,
    email: emailCol != null ? row[emailCol]?.trim() || undefined : undefined,
    mobile: mobileCol != null ? row[mobileCol]?.trim() || undefined : undefined,
  }));
}

function buildEmail(regNo: string, explicit?: string): string {
  if (explicit?.trim()) return normalizeEmail(explicit);
  const domain = (env.collegeEmailDomain || 'avichi.edu').replace(/^@/, '');
  return `${regNo.toLowerCase()}@${domain}`;
}

export async function previewBulkStudentImport(params: {
  rows: ImportRowInput[];
  departmentId: string;
  year: number;
  section?: string | null;
}) {
  const department = await prisma.department.findUnique({ where: { id: params.departmentId } });
  if (!department) throw new AppError(400, 'Invalid department');

  const year = Math.min(6, Math.max(1, params.year || 1));
  const section = params.section?.trim()?.toUpperCase() || null;

  const regNosInFile = new Set<string>();
  const emailsInFile = new Set<string>();
  const validated: ValidatedImportRow[] = [];

  for (const row of params.rows) {
    const nameRaw = row.name?.trim() ?? '';
    const regRaw = row.regNo?.trim() ?? '';
    if (!nameRaw && !regRaw) continue; // skip blank lines

    if (!nameRaw) {
      validated.push({
        rowNumber: row.rowNumber,
        name: '',
        regNo: regRaw,
        email: '',
        mobile: null,
        status: 'invalid',
        reason: 'Missing name',
      });
      continue;
    }
    if (!regRaw) {
      validated.push({
        rowNumber: row.rowNumber,
        name: nameRaw,
        regNo: '',
        email: '',
        mobile: null,
        status: 'invalid',
        reason: 'Missing roll number',
      });
      continue;
    }

    const regNo = normalizeRegNo(regRaw);
    const name = normalizeName(nameRaw);
    if (!isValidRegNo(regNo)) {
      validated.push({
        rowNumber: row.rowNumber,
        name,
        regNo,
        email: '',
        mobile: null,
        status: 'invalid',
        reason: 'Invalid roll number (use 6–12 letters/numbers)',
      });
      continue;
    }

    const email = buildEmail(regNo, row.email);
    if (!isValidEmail(email)) {
      validated.push({
        rowNumber: row.rowNumber,
        name,
        regNo,
        email,
        mobile: null,
        status: 'invalid',
        reason: 'Invalid email',
      });
      continue;
    }

    if (regNosInFile.has(regNo)) {
      validated.push({
        rowNumber: row.rowNumber,
        name,
        regNo,
        email,
        mobile: null,
        status: 'duplicate',
        reason: 'Duplicate roll number in file',
      });
      continue;
    }
    if (emailsInFile.has(email)) {
      validated.push({
        rowNumber: row.rowNumber,
        name,
        regNo,
        email,
        mobile: null,
        status: 'duplicate',
        reason: 'Duplicate email in file',
      });
      continue;
    }
    regNosInFile.add(regNo);
    emailsInFile.add(email);

    validated.push({
      rowNumber: row.rowNumber,
      name,
      regNo,
      email,
      mobile: row.mobile?.trim() || null,
      status: 'valid',
    });
  }

  // Check existing DB users
  const validRegs = validated.filter((v) => v.status === 'valid').map((v) => v.regNo);
  const validEmails = validated.filter((v) => v.status === 'valid').map((v) => v.email);
  const existing = await prisma.user.findMany({
    where: {
      deletedAt: null,
      OR: [{ regNo: { in: validRegs } }, { email: { in: validEmails } }],
    },
    select: { regNo: true, email: true },
  });
  const existReg = new Set(existing.map((e) => e.regNo));
  const existEmail = new Set(existing.map((e) => e.email));

  for (const v of validated) {
    if (v.status !== 'valid') continue;
    if (existReg.has(v.regNo)) {
      v.status = 'duplicate';
      v.reason = 'Student already exists (roll number)';
    } else if (existEmail.has(v.email)) {
      v.status = 'duplicate';
      v.reason = 'Student already exists (email)';
    }
  }

  const summary = {
    total: validated.length,
    valid: validated.filter((v) => v.status === 'valid').length,
    duplicate: validated.filter((v) => v.status === 'duplicate').length,
    invalid: validated.filter((v) => v.status === 'invalid').length,
    department: department.name,
    departmentId: department.id,
    year,
    section,
    students: validated,
  };

  return summary;
}

export async function executeBulkStudentImport(params: {
  rows: ImportRowInput[];
  departmentId: string;
  year: number;
  section?: string | null;
  password?: string;
  adminId: string;
  meta: { ipAddress?: string; userAgent?: string };
}) {
  const password = params.password?.trim() || 'Students@2026';
  assertStrongPassword(password);
  const passwordHash = await hashPassword(password);

  const preview = await previewBulkStudentImport(params);
  const toCreate = preview.students.filter((s) => s.status === 'valid');

  if (toCreate.length === 0) {
    throw new AppError(400, 'No valid students to import', 'NO_VALID_ROWS');
  }

  const batch = await prisma.studentImportBatch.create({
    data: {
      createdById: params.adminId,
      departmentId: params.departmentId,
      year: preview.year,
      section: preview.section,
      totalRows: preview.total,
      createdCount: 0,
      skippedCount: preview.duplicate + preview.invalid,
      failedCount: 0,
      status: 'COMPLETED',
      errorReport: preview.students
        .filter((s) => s.status !== 'valid')
        .map((s) => ({
          rowNumber: s.rowNumber,
          name: s.name,
          regNo: s.regNo,
          reason: s.reason,
        })),
    },
  });

  let createdCount = 0;
  const failed: Array<{ rowNumber: number; name: string; regNo: string; reason: string }> = [];
  const created: Array<{ regNo: string; email: string; name: string }> = [];

  // Process in chunks of 40
  const chunkSize = 40;
  for (let i = 0; i < toCreate.length; i += chunkSize) {
    const chunk = toCreate.slice(i, i + chunkSize);
    for (const row of chunk) {
      try {
        await prisma.$transaction(async (tx) => {
          const mobileHash = hashValue(`__nomobile__:${row.regNo}`);
          const mobileEnc = encryptField(`NONE:${row.regNo}`);

          // Soft-delete conflicts
          const soft = await tx.user.findMany({
            where: {
              deletedAt: { not: null },
              OR: [{ regNo: row.regNo }, { email: row.email }],
            },
          });
          for (const s of soft) {
            await tx.user.update({
              where: { id: s.id },
              data: {
                studentMasterId: null,
                email: `deleted+${s.id.slice(0, 8)}@invalid.local`,
                mobileHash: `deleted_${s.id}`,
                regNo: `DEL${s.id.replace(/-/g, '').slice(0, 9)}`.slice(0, 12),
              },
            });
          }

          let master = await tx.studentMaster.findUnique({ where: { regNo: row.regNo } });
          if (!master) {
            master = await tx.studentMaster.create({
              data: {
                regNo: row.regNo,
                name: row.name,
                email: row.email,
                mobileHash,
                mobileEnc,
                departmentId: params.departmentId,
                year: preview.year,
                section: preview.section,
                status: 'ACTIVE',
                verified: true,
                accountCreated: true,
              },
            });
          } else {
            master = await tx.studentMaster.update({
              where: { id: master.id },
              data: {
                name: row.name,
                email: row.email,
                departmentId: params.departmentId,
                year: preview.year,
                section: preview.section,
                status: 'ACTIVE',
                verified: true,
                accountCreated: true,
              },
            });
          }

          await tx.user.create({
            data: {
              regNo: row.regNo,
              email: row.email,
              passwordHash,
              mobileHash,
              mobileEnc,
              role: 'STUDENT',
              departmentId: params.departmentId,
              studentMasterId: master.id,
              accountStatus: 'ACTIVE',
              forcePasswordChange: true,
              failedLoginCount: 0,
              lockedUntil: null,
              importBatchId: batch.id,
              profile: {
                create: {
                  name: row.name,
                  year: preview.year,
                  section: preview.section,
                  privacy: 'PUBLIC',
                },
              },
            },
          });
        });
        createdCount += 1;
        created.push({ regNo: row.regNo, email: row.email, name: row.name });
      } catch (err) {
        failed.push({
          rowNumber: row.rowNumber,
          name: row.name,
          regNo: row.regNo,
          reason: err instanceof Error ? err.message : 'Create failed',
        });
      }
    }
  }

  const status =
    failed.length === 0
      ? 'COMPLETED'
      : createdCount > 0
        ? 'PARTIAL'
        : 'FAILED';

  const errorReport = [
    ...((batch.errorReport as object[]) ?? []),
    ...failed.map((f) => ({
      rowNumber: f.rowNumber,
      name: f.name,
      regNo: f.regNo,
      reason: f.reason,
    })),
  ];

  await prisma.studentImportBatch.update({
    where: { id: batch.id },
    data: {
      createdCount,
      failedCount: failed.length,
      skippedCount: preview.duplicate + preview.invalid,
      status,
      errorReport,
    },
  });

  await writeAuditLog({
    userId: params.adminId,
    action: 'BULK_STUDENT_IMPORT',
    resourceType: 'student_import',
    resourceId: batch.id,
    metadata: {
      departmentId: params.departmentId,
      department: preview.department,
      year: preview.year,
      section: preview.section,
      total: preview.total,
      created: createdCount,
      skipped: preview.duplicate + preview.invalid,
      failed: failed.length,
    },
    ...params.meta,
  });

  return {
    batchId: batch.id,
    department: preview.department,
    year: preview.year,
    section: preview.section,
    totalRows: preview.total,
    created: createdCount,
    skipped: preview.duplicate + preview.invalid,
    failed: failed.length,
    status,
    createdStudents: created,
    errorReport,
    initialPasswordHint: 'Configured initial password (hashed) — students must change on first login',
  };
}

export async function listImportHistory(limit = 30) {
  const rows = await prisma.studentImportBatch.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 100),
    include: {
      department: { select: { name: true } },
      createdBy: { include: { profile: true, admin: true } },
    },
  });
  return rows.map((b) => ({
    id: b.id,
    date: b.createdAt.toISOString(),
    department: b.department.name,
    year: b.year,
    section: b.section,
    totalRows: b.totalRows,
    created: b.createdCount,
    skipped: b.skippedCount,
    failed: b.failedCount,
    status: b.status,
    admin:
      b.createdBy.admin?.username ??
      b.createdBy.profile?.name ??
      b.createdBy.regNo,
    errorReport: b.errorReport,
  }));
}
