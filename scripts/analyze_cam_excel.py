#!/usr/bin/env python3
"""Comprehensive analysis of the CAM Excel file."""
import sys
import os
import json
from openpyxl import load_workbook
from openpyxl.utils import get_column_letter
import warnings
warnings.filterwarnings('ignore')

FILE = "/home/z/my-project/upload/BLESSED ONYEKACHI ELECTRONICS - Final Approval.xlsx"

print("=" * 80)
print("EXCEL FILE ANALYSIS")
print("=" * 80)
print(f"File: {FILE}")
print(f"Size: {os.path.getsize(FILE) / 1024 / 1024:.2f} MB")
print()

# Load workbook
wb = load_workbook(FILE, data_only=False, read_only=False)
print(f"Sheet names ({len(wb.sheetnames)}):")
for i, name in enumerate(wb.sheetnames, 1):
    ws = wb[name]
    print(f"  {i}. '{name}' — dims: {ws.dimensions}, max_row: {ws.max_row}, max_col: {ws.max_column}")
print()

# Analyze each sheet
for sheet_name in wb.sheetnames:
    ws = wb[sheet_name]
    print("=" * 80)
    print(f"SHEET: '{sheet_name}'")
    print(f"  Dimensions: {ws.dimensions}")
    print(f"  Max row: {ws.max_row}, Max col: {ws.max_column}")
    print(f"  Merged cells: {len(ws.merged_cells.ranges)}")

    # Print merged cells
    if ws.merged_cells.ranges:
        print("  Merged ranges (first 15):")
        for mr in list(ws.merged_cells.ranges)[:15]:
            print(f"    {mr}")

    # Print all non-empty cells with values
    print("\n  CELL CONTENTS:")
    print("  " + "-" * 76)
    row_count = 0
    for row in ws.iter_rows(min_row=1, max_row=min(ws.max_row, 500), values_only=False):
        for cell in row:
            if cell.value is not None and str(cell.value).strip() != '':
                col_letter = get_column_letter(cell.column)
                val = str(cell.value)
                if len(val) > 120:
                    val = val[:120] + "..."
                print(f"    {col_letter}{cell.row}: {val}")
        row_count += 1
        if row_count > 250:
            print("    ... (truncated, showing first 250 rows)")
            break
    print()

print("=" * 80)
print("ANALYSIS COMPLETE")
print("=" * 80)
