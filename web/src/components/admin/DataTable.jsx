// @admin-verified 2026-04-18
'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { ADMIN_C, F, S } from '../../lib/adminPalette';
import EmptyState from './EmptyState';
import Spinner from './Spinner';
import Button from './Button';

/**
 * @typedef Column
 * @property {string} key Unique key + default sort field.
 * @property {React.ReactNode} header Header cell content.
 * @property {(row:any)=>React.ReactNode} [render] Cell renderer. Defaults to row[key].
 * @property {string} [sortKey] Override sort accessor (defaults to `key`).
 * @property {boolean} [sortable=true] If false, column is not clickable.
 * @property {'left'|'right'|'center'} [align='left']
 * @property {string|number} [width] CSS width (e.g. 120 or '20%').
 * @property {boolean} [truncate=false] Adds ellipsis overflow.
 */

/**
 * Dense, sortable, paginated admin table.
 *
 * Built-ins:
 *   - Click a column header to sort (if sortable).
 *   - Sticky header (scroll wrapper sets max-height via `maxHeight` prop).
 *   - Row hover background.
 *   - Keyboard: j/k for next/prev row, Enter/Space to open the focused row
 *     via onRowClick. Arrow keys also work. Focus indicator is a 2px ring.
 *   - Pagination: page-size select (25/50/100), prev/next.
 *   - Empty state: renders the `empty` slot or a default EmptyState.
 *
 * @param {object} props
 * @param {Column[]} props.columns
 * @param {any[]} props.rows
 * @param {(row:any,i:number)=>string|number} [props.rowKey] Unique key per row.
 * @param {(row:any)=>void} [props.onRowClick]
 * @param {React.ReactNode} [props.toolbar] Rendered above the table.
 * @param {React.ReactNode} [props.empty] Empty-state override.
 * @param {boolean} [props.loading=false]
 * @param {number} [props.defaultPageSize=25] One of 25/50/100.
 * @param {boolean} [props.paginate=true]
 * @param {number|string} [props.maxHeight] e.g. 560. Enables sticky header.
 * @param {'default'|'compact'} [props.density='default']
 * @param {object} [props.style] Outer wrapper style.
 */
export default function DataTable({
  columns,
  rows,
  rowKey,
  onRowClick,
  toolbar,
  empty,
  loading = false,
  defaultPageSize = 25,
  paginate = true,
  maxHeight,
  density = 'default',
  style,
}) {
  const [sortState, setSortState] = useState({ key: null, dir: 'asc' });
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [page, setPage] = useState(0);
  const [focusIdx, setFocusIdx] = useState(-1);
  const tableRef = useRef(null);

  const keyFor = useCallback(
    (row, i) => (rowKey ? rowKey(row, i) : row?.id ?? i),
    [rowKey],
  );

  const sorted = useMemo(() => {
    if (!sortState.key) return rows;
    const col = columns.find((c) => c.key === sortState.key);
    if (!col) return rows;
    const accessor = col.sortKey || col.key;
    const dir = sortState.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a?.[accessor];
      const bv = b?.[accessor];
      if (av == null && bv == null) return 0;
      if (av == null) return -dir;
      if (bv == null) return dir;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, columns, sortState]);

  const totalPages = paginate ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const currentPage = Math.min(page, totalPages - 1);
  const pageRows = paginate
    ? sorted.slice(currentPage * pageSize, currentPage * pageSize + pageSize)
    : sorted;

  // Reset focus when rows change
  useEffect(() => {
    setFocusIdx((idx) => (idx >= pageRows.length ? -1 : idx));
  }, [pageRows.length]);

  const toggleSort = (col) => {
    if (col.sortable === false) return;
    setSortState((prev) => {
      if (prev.key !== col.key) return { key: col.key, dir: 'asc' };
      if (prev.dir === 'asc') return { key: col.key, dir: 'desc' };
      return { key: null, dir: 'asc' };
    });
  };

  const handleKeyDown = (e) => {
    if (!pageRows.length) return;
    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusIdx((idx) => Math.min(pageRows.length - 1, idx < 0 ? 0 : idx + 1));
    } else if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIdx((idx) => Math.max(0, idx < 0 ? 0 : idx - 1));
    } else if ((e.key === 'Enter' || e.key === ' ') && focusIdx >= 0) {
      e.preventDefault();
      onRowClick?.(pageRows[focusIdx]);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFocusIdx(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setFocusIdx(pageRows.length - 1);
    }
  };

  const cellPadY = density === 'compact' ? 4 : 8;
  const cellPadX = S[3];

  const hasRows = pageRows.length > 0;

  return (
    <div style={{ ...style }}>
      {toolbar}

      <div
        style={{
          border: `1px solid ${ADMIN_C.divider}`,
          borderRadius: 8,
          overflow: 'hidden',
          background: ADMIN_C.bg,
          position: 'relative',
        }}
      >
        <div
          onKeyDown={handleKeyDown}
          tabIndex={0}
          ref={tableRef}
          onFocus={(e) => {
            if (e.currentTarget === e.target) {
              e.currentTarget.style.boxShadow = `inset 0 0 0 2px ${ADMIN_C.ring}`;
            }
          }}
          onBlur={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
          role="grid"
          aria-rowcount={sorted.length}
          style={{
            maxHeight,
            overflow: maxHeight ? 'auto' : 'visible',
            overflowX: 'auto',
            outline: 'none',
            transition: 'box-shadow 120ms ease',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'separate',
              borderSpacing: 0,
              fontSize: F.base,
              minWidth: 640,
            }}
          >
            <thead>
              <tr>
                {columns.map((col) => {
                  const isSorted = sortState.key === col.key;
                  const sortable = col.sortable !== false;
                  return (
                    <th
                      key={col.key}
                      scope="col"
                      onClick={sortable ? () => toggleSort(col) : undefined}
                      style={{
                        textAlign: col.align || 'left',
                        padding: `${cellPadY}px ${cellPadX}px`,
                        background: ADMIN_C.card,
                        borderBottom: `1px solid ${ADMIN_C.divider}`,
                        fontSize: F.xs,
                        fontWeight: 600,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: ADMIN_C.soft,
                        cursor: sortable ? 'pointer' : 'default',
                        userSelect: 'none',
                        position: maxHeight ? 'sticky' : 'static',
                        top: 0,
                        zIndex: 1,
                        width: col.width,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {col.header}
                        {sortable && (
                          <span
                            aria-hidden="true"
                            style={{
                              fontSize: 9,
                              color: isSorted ? ADMIN_C.accent : ADMIN_C.muted,
                              lineHeight: 1,
                            }}
                          >
                            {isSorted ? (sortState.dir === 'asc' ? '▲' : '▼') : '↕'}
                          </span>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading && !hasRows && (
                <tr>
                  <td colSpan={columns.length} style={{ padding: S[8], textAlign: 'center' }}>
                    <Spinner />
                  </td>
                </tr>
              )}

              {!loading && !hasRows && (
                <tr>
                  <td colSpan={columns.length} style={{ padding: 0 }}>
                    {empty ?? <EmptyState title="No results" description="Nothing matches the current filter." />}
                  </td>
                </tr>
              )}

              {hasRows && pageRows.map((row, i) => {
                const focused = focusIdx === i;
                return (
                  <tr
                    key={keyFor(row, i)}
                    onClick={() => onRowClick?.(row)}
                    onMouseEnter={(e) => {
                      if (!focused) e.currentTarget.style.background = ADMIN_C.hover;
                    }}
                    onMouseLeave={(e) => {
                      if (!focused) e.currentTarget.style.background = 'transparent';
                    }}
                    style={{
                      cursor: onRowClick ? 'pointer' : 'default',
                      background: focused ? ADMIN_C.hover : 'transparent',
                      boxShadow: focused ? `inset 2px 0 0 ${ADMIN_C.accent}` : 'none',
                      transition: 'background 90ms ease',
                    }}
                  >
                    {columns.map((col) => {
                      const content = col.render ? col.render(row) : row?.[col.key];
                      return (
                        <td
                          key={col.key}
                          style={{
                            padding: `${cellPadY}px ${cellPadX}px`,
                            borderBottom: `1px solid ${ADMIN_C.divider}`,
                            color: ADMIN_C.white,
                            textAlign: col.align || 'left',
                            verticalAlign: 'middle',
                            maxWidth: col.truncate ? 0 : undefined,
                            whiteSpace: col.truncate ? 'nowrap' : undefined,
                            overflow: col.truncate ? 'hidden' : undefined,
                            textOverflow: col.truncate ? 'ellipsis' : undefined,
                            width: col.width,
                          }}
                        >
                          {content ?? <span style={{ color: ADMIN_C.muted }}>—</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {paginate && hasRows && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: S[3],
            fontSize: F.sm,
            color: ADMIN_C.dim,
            gap: S[3],
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
            <span>Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
              style={{
                padding: '2px 6px',
                fontSize: F.sm,
                background: ADMIN_C.bg,
                color: ADMIN_C.white,
                border: `1px solid ${ADMIN_C.divider}`,
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
            <span>
              {sorted.length === 0
                ? '0'
                : `${currentPage * pageSize + 1}–${Math.min(sorted.length, (currentPage + 1) * pageSize)}`}
              {' of '}{sorted.length}
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={currentPage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Prev
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={currentPage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * @example
 * import DataTable from '@/components/admin/DataTable';
 * const columns = [
 *   { key: 'title', header: 'Title', truncate: true },
 *   { key: 'author', header: 'Author' },
 *   { key: 'views', header: 'Views', align: 'right' },
 * ];
 * <DataTable
 *   columns={columns}
 *   rows={stories}
 *   rowKey={(r) => r.id}
 *   onRowClick={(r) => router.push(`/admin/stories/${r.id}`)}
 *   toolbar={<Toolbar left={<TextInput type="search" placeholder="Search" />} />}
 * />
 */
