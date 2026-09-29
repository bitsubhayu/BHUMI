import zipfile
import xml.etree.ElementTree as ET
import csv
import os

xlsx_path = r'data\raw_lgd\allBlockofIndia.xlsx'

def extract_rows():
    with zipfile.ZipFile(xlsx_path, 'r') as z:
        sheet_tree = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
        rows = sheet_tree.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}sheetData/{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row')
        
        extracted = []
        for r in rows:
            r_idx = int(r.attrib.get('r'))
            if r_idx < 3:
                continue # Skip title (1) and header (2)
            
            # Map column letters to values
            cells = {}
            for c in r.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                ref = c.attrib.get('r')
                col = ''.join([ch for ch in ref if ch.isalpha()])
                t = c.attrib.get('t')
                
                val = ""
                if t == 'inlineStr':
                    is_elem = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}is')
                    if is_elem is not None:
                        t_elem = is_elem.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
                        if t_elem is not None and t_elem.text:
                            val = t_elem.text.strip()
                else:
                    v_elem = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                    if v_elem is not None and v_elem.text:
                        val = v_elem.text.strip()
                        # convert float strings like '6498.0' to int '6498'
                        if val.endswith('.0'):
                            val = val[:-2]
                cells[col] = val
            
            sno = cells.get('A', '')
            state_code = cells.get('B', '')
            state_name = cells.get('C', '')
            dist_code = cells.get('D', '')
            dist_name = cells.get('E', '')
            block_code = cells.get('F', '')
            block_version = cells.get('G', '')
            block_name = cells.get('H', '')
            block_local_name = cells.get('I', '')
            
            if block_code and block_name:
                extracted.append({
                    'sno': sno,
                    'state_code': state_code,
                    'state_name': state_name,
                    'dist_code': dist_code,
                    'dist_name': dist_name,
                    'block_code': block_code,
                    'block_version': block_version,
                    'block_name': block_name,
                    'block_local_name': block_local_name
                })
        return extracted

def main():
    records = extract_rows()
    print(f"Total extracted block records: {len(records)}")
    
    unique_block_codes = set()
    dup_block_codes = []
    states = set()
    districts = set()
    state_block_counts = {}
    
    for r in records:
        bcode = r['block_code']
        if bcode in unique_block_codes:
            dup_block_codes.append(r)
        else:
            unique_block_codes.add(bcode)
            
        sname = r['state_name']
        dname = r['dist_name']
        states.add((r['state_code'], sname))
        districts.add((r['dist_code'], dname, sname))
        state_block_counts[sname] = state_block_counts.get(sname, 0) + 1
        
    print(f"Unique LGD Block Codes: {len(unique_block_codes)}")
    print(f"Duplicate Block Codes count: {len(dup_block_codes)}")
    if dup_block_codes:
        print("Duplicate block codes examples:", dup_block_codes[:5])
        
    print(f"Distinct States/UTs count: {len(states)}")
    print(f"Distinct Districts count: {len(districts)}")
    
    print("\n--- STATE-WISE BLOCK COUNTS ---")
    for sname, count in sorted(state_block_counts.items(), key=lambda x: -x[1]):
        print(f"  {sname}: {count}")
        
    # Check existing 4 sample blocks
    print("\n--- RECONCILING EXISTING 4 SAMPLES IN LGD MASTER ---")
    for r in records:
        if r['dist_name'].lower() == 'pune' and 'haveli' in r['block_name'].lower():
            print(f"  Found Haveli: Block Code={r['block_code']}, Name={r['block_name']}, Dist={r['dist_name']}, State={r['state_name']}")
        if r['dist_name'].lower() == 'jodhpur' and 'mandore' in r['block_name'].lower():
            print(f"  Found Mandore: Block Code={r['block_code']}, Name={r['block_name']}, Dist={r['dist_name']}, State={r['state_name']}")
        if '24 parganas' in r['dist_name'].lower() and 'barasat' in r['block_name'].lower():
            print(f"  Found Barasat: Block Code={r['block_code']}, Name={r['block_name']}, Dist={r['dist_name']}, State={r['state_name']}")

    # Save to staging CSV
    out_csv = r'data\raw_lgd\lgd_development_blocks_master.csv'
    with open(out_csv, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['sno', 'state_code', 'state_name', 'dist_code', 'dist_name', 'block_code', 'block_version', 'block_name', 'block_local_name'])
        writer.writeheader()
        writer.writerows(records)
    print(f"\nSaved raw master CSV: {out_csv} ({os.path.getsize(out_csv)} bytes)")

if __name__ == '__main__':
    main()
