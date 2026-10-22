'use client';

/**
 * Planilha CSV no formato do Excel em português: separador ponto e vírgula, aspas duplicadas para
 * escapar e BOM UTF-8 (acentos corretos). Os nomes das colunas são as próprias chaves dos objetos,
 * então use rótulos em português ("Preço de referência (R$)").
 */
function convertToCSV(data: any[]): string {
    if (!data || data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const linhas = [headers.map(esc).join(';')];
    for (const row of data) linhas.push(headers.map(h => esc(row[h])).join(';'));
    return linhas.join('\r\n');
}

/** Número no formato brasileiro (1.234,56), que o Excel em português reconhece como número. */
export const numeroBr = (v: number | null | undefined, casas = 2) =>
    v === null || v === undefined || Number.isNaN(v) ? '' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** Data ISO (aaaa-mm-dd) para dd/mm/aaaa. */
export const dataBr = (iso?: string | null) => {
    if (!iso) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

export function exportToCsv(data: any[], filename: string) {
    const csvString = convertToCSV(data);
    const blob = new Blob([`\uFEFF${csvString}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
