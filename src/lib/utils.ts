import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { addDays, parseISO } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const formatCurrency = (value: number | null | undefined) => {
  if (value === null || value === undefined || isNaN(value)) return '';
  // Use a very small number to handle potential floating point inaccuracies for zero
  if (Math.abs(value) < 0.00001) {
    return new Intl.NumberFormat('pt-BR', { 
        style: 'currency', 
        currency: 'BRL',
        minimumFractionDigits: 2
    }).format(0);
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
};

export const parseCurrency = (value: string): number => {
    if (typeof value !== 'string') return 0;
    // Remove "R$", trim whitespace, and handle thousands separators for pt-BR.
    const sanitized = value.replace(/R\$\s?/, '').replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(sanitized);
    return isNaN(parsed) ? 0 : parsed;
};

export const formatPercent = (value: number | null | undefined) => {
  if (value === null || value === undefined || isNaN(value)) return '';
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
};

export const parsePercent = (value: string): number => {
    const sanitized = value.replace('%', '').trim();
    const withDot = sanitized.replace(',', '.');
    const parsed = parseFloat(withDot);
    return isNaN(parsed) ? 0 : parsed;
};

export const formatDecimal = (value: number | null | undefined, fractionDigits = 4) => {
  if (value === null || value === undefined || isNaN(value)) return '';
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  });
};

export const parseDecimal = (value: string): number => {
    const sanitized = value.replace(/[^0-9,]/g, '').replace(',', '.');
    const parsed = parseFloat(sanitized);
    return isNaN(parsed) ? 0 : parsed;
};

export const formatCnpj = (cnpj: string | null | undefined): string => {
  if (!cnpj) return '';
  const cleaned = cnpj.replace(/\D/g, '');
  if (cleaned.length !== 14) return cnpj;
  return cleaned.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    '$1.$2.$3/$4-$5'
  );
};

export const parseCnpj = (cnpj: string | null | undefined): string => {
  if (!cnpj) return '';
  return cnpj.replace(/\D/g, '');
};

export const formatDateTime = (isoString: string | null | undefined): string => {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        return date.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    } catch {
        return '';
    }
}

export function calculateDeadline(startDate: string, days: number): Date {
    try {
      const start = parseISO(startDate);
      return addDays(start, days);
    } catch (e) {
      // Return a date in the past if parsing fails
      return new Date(0);
    }
}
