'use client';

import * as React from 'react';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

export interface ColumnDef<TData> {
  id?: string;
  accessorKey?: keyof TData | 'actions' | string;
  header: React.ReactNode;
  cell: (row: TData) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
}

interface DataTableProps<TData extends { id: string }> {
  columns: ColumnDef<TData>[];
  data: TData[];
  isLoading?: boolean;
  emptyStateMessage?: string;
}

export function DataTable<TData extends { id: string }>({
  columns,
  data,
  isLoading = false,
  emptyStateMessage = 'Nenhum resultado encontrado.',
}: DataTableProps<TData>) {
  if (isLoading) {
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column, index) => (
                <TableHead key={index} className={`text-${column.align || 'left'}`}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, rowIndex) => (
              <TableRow key={rowIndex}>
                {columns.map((_, cellIndex) => (
                  <TableCell key={cellIndex}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-md border text-center">
        {emptyStateMessage}
      </div>
    );
  }

  // Always render the table. The <Table> component from ui/table handles the responsive scrolling container.
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            {columns.map((column, index) => (
              <TableHead key={index} className={`whitespace-nowrap text-${column.align || 'left'}`}>
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => (
            <TableRow key={row.id} data-state="false" className="hover:bg-muted/50">
              {columns.map((column, cellIndex) => (
                <TableCell key={cellIndex} className={`text-${column.align || 'left'}`}>
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
