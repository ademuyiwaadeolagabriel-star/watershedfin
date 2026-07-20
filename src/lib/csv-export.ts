// ============================================================================
// R2: CSV EXPORT UTILITY
// Generates CSV files from array of objects for regulatory reporting
// ============================================================================

export function exportToCSV(data: any[], filename: string, headers?: Record<string, string>) {
  if (!data || data.length === 0) {
    alert('No data to export');
    return;
  }

  // Get column names from first row or from headers param
  const columns = headers ? Object.keys(headers) : Object.keys(data[0]);
  const headerLabels = headers ? Object.values(headers) : columns;

  // Build CSV rows
  const csvRows = [
    headerLabels.map(h => `"${h}"`).join(','),
    ...data.map(row =>
      columns.map(col => {
        const val = row[col];
        if (val === null || val === undefined) return '""';
        if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
        if (val instanceof Date) return `"${val.toISOString()}"`;
        return `"${val}"`;
      }).join(',')
    ),
  ];

  const csv = csvRows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
