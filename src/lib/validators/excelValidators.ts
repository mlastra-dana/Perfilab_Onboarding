import { z } from 'zod';

export const identityRegex = /^(V|E|J)-?\d{5,10}$/i;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const rowSchema = z.object({
  cedula: z
    .string({ required_error: 'La cédula es obligatoria.' })
    .min(1, 'La cédula es obligatoria.')
    .max(12, 'La cédula excede longitud permitida.')
    .regex(identityRegex, 'Cédula inválida. Formato esperado: V-12345678'),
  nombre: z
    .string({ required_error: 'El nombre es obligatorio.' })
    .min(1, 'El nombre es obligatorio.')
    .max(40, 'Nombre demasiado largo (máximo 40 caracteres).'),
  email: z.string().optional(),
  telefono: z.string().optional()
});

export function validateExcelRow(row: Record<string, unknown>) {
  const normalized = {
    cedula: String(row.cedula ?? '').trim(),
    nombre: String(row.nombre ?? '').trim(),
    email: String(row.email ?? '').trim(),
    telefono: String(row.telefono ?? '').trim()
  };

  const issues: string[] = [];
  const schemaResult = rowSchema.safeParse(normalized);

  if (!schemaResult.success) {
    issues.push(...schemaResult.error.issues.map((i) => i.message));
  }

  if (normalized.cedula && /[.,a-zA-Z]/.test(normalized.cedula.replace(/^[VEJ]-?/i, ''))) {
    issues.push('Cédula contiene caracteres no permitidos (puntos, comas o letras).');
  }

  if (normalized.email && !emailRegex.test(normalized.email)) {
    issues.push('Email inválido.');
  }

  if (normalized.telefono && (!/^\d+$/.test(normalized.telefono) || normalized.telefono.length < 7)) {
    issues.push('Teléfono inválido. Use solo dígitos con mínimo 7 caracteres.');
  }

  return {
    normalized,
    valid: issues.length === 0,
    issues
  };
}
