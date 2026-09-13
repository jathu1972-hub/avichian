/**
 * Bulk staff import for Super Admin — creates real User + Profile + Staff rows.
 * Unique temporary password per account; only password hashes stored in PostgreSQL.
 */
import { randomBytes } from 'crypto';
import {
  isValidEmail,
  isValidRegNo,
  normalizeEmail,
  normalizeName,
  normalizeRegNo,
} from '@avichian/shared';
import { prisma } from '../../lib/prisma.js';
import { encryptField, hashValue } from '../../utils/crypto.js';
import { hashPassword } from '../../utils/password.js';
import { AppError } from '../../utils/errors.js';
import { writeAuditLog } from '../audit.service.js';
import { env } from '../../config/env.js';

export type StaffImportRowInput = {
  rowNumber: number;
  name?: string;
  staffId?: string;
  email?: string;
  department?: string;
  designation?: string;
  mobile?: string;
};

export type ValidatedStaffImportRow = {
  rowNumber: number;
  name: string;
  staffId: string;
  email: string;
  departmentName: string | null;
  designation: string | null;
  mobile: string | null;
  status: 'valid' | 'duplicate' | 'invalid';
  reason?: string;
};

const NAME_ALIASES = [
  'name',
  'staff name',
  'full name',
  'employee name',
  'faculty name',
  'student name',
];
const STAFF_ID_ALIASES = [
  'staff id',
  'staffid',
  'staff_id',
  'employee id',
  'employee no',
  'employee number',
  'emp id',
  'emp no',
  'id',
  'staff code',
];
const EMAIL_ALIASES = ['email', 'email address', 'e-mail', 'mail', 'college email'];
const DEPT_ALIASES = ['department', 'dept', 'department name', 'dept name'];
const DESIGNATION_ALIASES = [
  'designation',
  'title',
  'role',
  'role/designation',
  'position',
  'job title',
];
const MOBILE_ALIASES = ['mobile', 'phone', 'phone number', 'mobile number', 'contact'];

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

export function detectStaffColumnMapping(headers: string[]): {
  nameCol: number | null;
  staffIdCol: number | null;
  emailCol: number | null;
  departmentCol: number | null;
  designationCol: number | null;
  mobileCol: number | null;
  confidence: 'high' | 'medium' | 'low';
} {
  const normalized = headers.map(normHeader);
  const find = (aliases: string[]) => {
    const i = normalized.findIndex((h) => aliases.includes(h));
    return i >= 0 ? i : null;
  };
  const nameCol = find(NAME_ALIASES);
  const staffIdCol = find(STAFF_ID_ALIASES);
  const emailCol = find(EMAIL_ALIASES);
  const departmentCol = find(DEPT_ALIASES);
  const designationCol = find(DESIGNATION_ALIASES);
  const mobileCol = find(MOBILE_ALIASES);
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (nameCol != null && staffIdCol != null) confidence = 'high';
  else if (nameCol != null || staffIdCol != null) confidence = 'medium';
  return {
    nameCol,
    staffIdCol,
    emailCol,
    departmentCol,
    designationCol,
    mobileCol,
    confidence,
  };
}

export function staffRowsFromMatrix(
  headers: string[],
  matrix: string[][],
  mapping?: {
    nameCol: number;
    staffIdCol: number;
    emailCol?: number | null;
    departmentCol?: number | null;
    designationCol?: number | null;
    mobileCol?: number | null;
  },
): StaffImportRowInput[] {
  const detected = detectStaffColumnMapping(headers);
  const nameCol = mapping?.nameCol ?? detected.nameCol;
  const staffIdCol = mapping?.staffIdCol ?? detected.staffIdCol;
  const emailCol = mapping?.emailCol ?? detected.emailCol;
  const departmentCol = mapping?.departmentCol ?? detected.departmentCol;
  const designationCol = mapping?.designationCol ?? detected.designationCol;
  const mobileCol = mapping?.mobileCol ?? detected.mobileCol;
  if (nameCol == null || staffIdCol == null) {
    throw new AppError(400, 'Could not detect Name and Staff ID columns', 'COLUMN_MAP_REQUIRED');
  }

  return matrix.map((row, idx) => ({
    rowNumber: idx + 2,
    name: row[nameCol]?.trim() || undefined,
    staffId: row[staffIdCol]?.trim() || undefined,
    email: emailCol != null ? row[emailCol]?.trim() || undefined : undefined,
    department: departmentCol != null ? row[departmentCol]?.trim() || undefined : undefined,
    designation: designationCol != null ? row[designationCol]?.trim() || undefined : undefined,
    mobile: mobileCol != null ? row[mobileCol]?.trim() || undefined : undefined,
  }));
}

function buildStaffEmail(staffId: string, explicit?: string): string {
  if (explicit?.trim()) return normalizeEmail(explicit);
  const domain = (env.collegeEmailDomain || 'avichi.edu').replace(/^@/, '');
  return `${staffId.toLowerCase()}@${domain}`;
}

/** Unique temporary password — never reused across rows. */
export function generateUniqueTempPassword(): string {
  const chunk = randomBytes(6).toString('base64url').replace(/[^a-zA-Z0-9]/g, '');
  // Ensures upper, lower, number, special for campus password policy
  return `St@${chunk.slice(0, 6)}A9!`;
}

export async function previewBulkStaffImport(params: {
  rows: StaffImportRowInput[];
  /** Super Admin selected department when Excel has no dept column */
  departmentId?: string | null;
}) {
  let fallbackDept: { id: string; name: string } | null = null;
  if (params.departmentId) {
    const d = await prisma.department.findUnique({ where: { id: params.departmentId } });
    if (!d) throw new AppError(400, 'Invalid department');
    fallbackDept = d;
  }

  const allDepts = await prisma.department.findMany({ select: { id: true, name: true } });
  const deptByName = new Map(allDepts.map((d) => [d.name.trim().toLowerCase(), d]));

  const idsInFile = new Set<string>();
  const emailsInFile = new Set<string>();
  const validated: ValidatedStaffImportRow[] = [];

  for (const row of params.rows) {
    const nameRaw = row.name?.trim() ?? '';
    const idRaw = row.staffId?.trim() ?? '';
    if (!nameRaw && !idRaw) continue;

    if (!nameRaw) {
      validated.push({
        rowNumber: row.rowNumber,
        name: '',
        staffId: idRaw,
        email: '',
        departmentName: row.department ?? null,
        designation: row.designation ?? null,
        mobile: null,
        status: 'invalid',
        reason: 'Missing name',
      });
      continue;
    }
    if (!idRaw) {
      validated.push({
        rowNumber: row.rowNumber,
        name: nameRaw,
        staffId: '',
        email: '',
        departmentName: row.department ?? null,
        designation: row.designation ?? null,
        mobile: null,
        status: 'invalid',
        reason: 'Missing Staff ID',
      });
      continue;
    }

    const staffId = normalizeRegNo(idRaw);
    const name = normalizeName(nameRaw);
    if (!isValidRegNo(staffId) && staffId.length < 3) {
      validated.push({
        rowNumber: row.rowNumber,
        name,
        staffId,
        email: '',
        departmentName: row.department ?? null,
        designation: row.designation ?? null,
        mobile: null,
        status: 'invalid',
        reason: 'Invalid Staff ID',
      });
      continue;
    }

    const email = buildStaffEmail(staffId, row.email);
    if (!isValidEmail(email)) {
      validated.push({
        rowNumber: row.rowNumber,
        name,
        staffId,
        email,
        departmentName: row.department ?? null,
        designation: row.designation ?? null,
        mobile: null,
        status: 'invalid',
        reason: 'Invalid email',
      });
      continue;
    }

    let departmentName: string | null = row.department?.trim() || null;
    if (departmentName) {
      const match = deptByName.get(departmentName.toLowerCase());
      if (!match) {
        validated.push({
          rowNumber: row.rowNumber,
          name,
          staffId,
          email,
          departmentName,
          designation: row.designation ?? null,
          mobile: null,
          status: 'invalid',
          reason: `Unknown department: ${departmentName}`,
        });
        continue;
      }
      departmentName = match.name;
    } else if (fallbackDept) {
      departmentName = fallbackDept.name;
    } else {
      validated.push({
        rowNumber: row.rowNumber,
        name,
        staffId,
        email,
        departmentName: null,
        designation: row.designation ?? null,
        mobile: null,
        status: 'invalid',
        reason: 'Missing department (select a default department or include it in the file)',
      });
      continue;
    }

    if (idsInFile.has(staffId)) {
      validated.push({
        rowNumber: row.rowNumber,
        name,
        staffId,
        email,
        departmentName,
        designation: row.designation ?? null,
        mobile: null,
        status: 'duplicate',
        reason: 'Duplicate Staff ID in file',
      });
      continue;
    }
    if (emailsInFile.has(email)) {
      validated.push({
        rowNumber: row.rowNumber,
        name,
        staffId,
        email,
        departmentName,
        designation: row.designation ?? null,
        mobile: null,
        status: 'duplicate',
        reason: 'Duplicate email in file',
      });
      continue;
    }
    idsInFile.add(staffId);
    emailsInFile.add(email);

    validated.push({
      rowNumber: row.rowNumber,
      name,
      staffId,
      email,
      departmentName,
      designation: row.designation?.trim() || null,
      mobile: row.mobile?.trim() || null,
      status: 'valid',
    });
  }

  const validIds = validated.filter((v) => v.status === 'valid').map((v) => v.staffId);
  const validEmails = validated.filter((v) => v.status === 'valid').map((v) => v.email);

  const [existingUsers, existingStaff] = await Promise.all([
    prisma.user.findMany({
      where: {
        deletedAt: null,
        OR: [{ regNo: { in: validIds } }, { email: { in: validEmails } }],
      },
      select: { regNo: true, email: true },
    }),
    prisma.staff.findMany({
      where: { staffId: { in: validIds } },
      select: { staffId: true },
    }),
  ]);
  const existReg = new Set(existingUsers.map((e) => e.regNo));
  const existEmail = new Set(existingUsers.map((e) => e.email));
  const existStaff = new Set(existingStaff.map((e) => e.staffId));

  for (const v of validated) {
    if (v.status !== 'valid') continue;
    if (existStaff.has(v.staffId) || existReg.has(v.staffId)) {
      v.status = 'duplicate';
      v.reason = 'Staff already exists (Staff ID)';
    } else if (existEmail.has(v.email)) {
      v.status = 'duplicate';
      v.reason = 'User already exists (email)';
    }
  }

  return {
    total: validated.length,
    valid: validated.filter((v) => v.status === 'valid').length,
    duplicate: validated.filter((v) => v.status === 'duplicate').length,
    invalid: validated.filter((v) => v.status === 'invalid').length,
    department: fallbackDept?.name ?? null,
    departmentId: fallbackDept?.id ?? null,
    staff: validated,
  };
}

export async function executeBulkStaffImport(params: {
  rows: StaffImportRowInput[];
  departmentId?: string | null;
  adminId: string;
  meta: { ipAddress?: string; userAgent?: string };
  fileName?: string;
}) {
  const preview = await previewBulkStaffImport({
    rows: params.rows,
    departmentId: params.departmentId,
  });
  const toCreate = preview.staff.filter((s) => s.status === 'valid');

  if (toCreate.length === 0) {
    throw new AppError(400, 'No valid staff to import', 'NO_VALID_ROWS');
  }

  const allDepts = await prisma.department.findMany({ select: { id: true, name: true } });
  const deptByName = new Map(allDepts.map((d) => [d.name.trim().toLowerCase(), d]));

  let createdCount = 0;
  const failed: Array<{ rowNumber: number; name: string; staffId: string; reason: string }> = [];
  /** One-time credentials for Super Admin download — not stored in DB */
  const credentials: Array<{
    staffId: string;
    email: string;
    name: string;
    temporaryPassword: string;
  }> = [];

  const chunkSize = 25;
  for (let i = 0; i < toCreate.length; i += chunkSize) {
    const chunk = toCreate.slice(i, i + chunkSize);
    for (const row of chunk) {
      try {
        const dept = deptByName.get((row.departmentName || '').toLowerCase());
        if (!dept) {
          failed.push({
            rowNumber: row.rowNumber,
            name: row.name,
            staffId: row.staffId,
            reason: 'Department not found',
          });
          continue;
        }

        const temporaryPassword = generateUniqueTempPassword();
        const passwordHash = await hashPassword(temporaryPassword);
        const mobile = row.mobile || `NONE:${row.staffId}`;
        const mobileHash = hashValue(mobile.startsWith('NONE:') ? `__nomobile__:${row.staffId}` : mobile);
        const mobileEnc = encryptField(mobile.startsWith('NONE:') ? mobile : mobile);

        await prisma.$transaction(async (tx) => {
          // Free soft-deleted conflicts on regNo/email
          const soft = await tx.user.findMany({
            where: {
              deletedAt: { not: null },
              OR: [{ regNo: row.staffId }, { email: row.email }],
            },
          });
          for (const s of soft) {
            await tx.user.update({
              where: { id: s.id },
              data: {
                email: `deleted+${s.id.slice(0, 8)}@invalid.local`,
                mobileHash: `deleted_${s.id}`,
                regNo: `DEL${s.id.replace(/-/g, '').slice(0, 9)}`.slice(0, 12),
              },
            });
          }

          // Guard against races
          const clash = await tx.user.findFirst({
            where: {
              deletedAt: null,
              OR: [{ regNo: row.staffId }, { email: row.email }],
            },
          });
          if (clash) {
            throw new Error('Account already exists');
          }
          const staffClash = await tx.staff.findUnique({ where: { staffId: row.staffId } });
          if (staffClash) {
            throw new Error('Staff ID already exists');
          }

          await tx.user.create({
            data: {
              regNo: row.staffId,
              email: row.email,
              passwordHash,
              mobileHash,
              mobileEnc,
              role: 'STAFF',
              departmentId: dept.id,
              accountStatus: 'ACTIVE',
              forcePasswordChange: true,
              profile: {
                create: {
                  name: row.name,
                },
              },
              staff: {
                create: {
                  staffId: row.staffId,
                  departmentId: dept.id,
                  title: row.designation,
                  active: true,
                },
              },
            },
          });
        });

        createdCount += 1;
        credentials.push({
          staffId: row.staffId,
          email: row.email,
          name: row.name,
          temporaryPassword,
        });
      } catch (err) {
        failed.push({
          rowNumber: row.rowNumber,
          name: row.name,
          staffId: row.staffId,
          reason: err instanceof Error ? err.message : 'Create failed',
        });
      }
    }
  }

  await writeAuditLog({
    userId: params.adminId,
    action: 'USER_CREATED',
    resourceType: 'staff_bulk_import',
    resourceId: params.adminId,
    metadata: {
      kind: 'BULK_STAFF_IMPORT',
      fileName: params.fileName ?? null,
      total: preview.total,
      created: createdCount,
      failed: failed.length,
      skipped: preview.duplicate + preview.invalid,
      departmentId: params.departmentId ?? null,
      // Never log passwords or hashes
    },
    ...params.meta,
  });

  return {
    created: createdCount,
    skipped: preview.duplicate + preview.invalid,
    failed: failed.length,
    status: failed.length && createdCount ? 'PARTIAL' : createdCount ? 'COMPLETED' : 'FAILED',
    errorReport: [
      ...preview.staff
        .filter((s) => s.status !== 'valid')
        .map((s) => ({
          rowNumber: s.rowNumber,
          name: s.name,
          staffId: s.staffId,
          reason: s.reason ?? s.status,
        })),
      ...failed,
    ],
    /** One-time credentials for Super Admin — not stored server-side after response */
    credentials,
  };
}
