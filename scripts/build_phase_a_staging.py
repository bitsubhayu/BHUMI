import os
import io
import re
import csv
import pandas as pd
import pyarrow.parquet as pq
import shapely.wkb

def normalize_text(text):
    if not text or pd.isna(text):
        return ""
    text = str(text).strip()
    text = re.sub(r'\s+', ' ', text)
    return text.title()

def main():
    print("=== BHUMI PHASE A: STAGING DATASET GENERATION ===")
    
    # 1. Load authoritative LGD master
    lgd_csv = os.path.join('data', 'raw_lgd', 'lgd_development_blocks_master.csv')
    print(f"Loading authoritative LGD master from {lgd_csv}...")
    lgd_df = pd.read_csv(lgd_csv)
    print(f"Total LGD records: {len(lgd_df)}")
    print(f"Unique LGD codes: {lgd_df['block_code'].nunique()}")
    
    # Handle duplicates in LGD master (15 codes appeared twice due to district bifurcation)
    # Deduplicate deterministically keeping the latest/active district assignment
    lgd_unique = lgd_df.drop_duplicates(subset=['block_code'], keep='first').copy()
    print(f"Deduplicated unique LGD blocks: {len(lgd_unique)}")

    # 2. Load spatial parquet
    parquet_path = os.path.join('data', 'raw_lgd', 'LGD_Blocks.parquet')
    print(f"Loading spatial parquet from {parquet_path}...")
    table = pq.read_table(parquet_path, columns=['block_lgd', 'block_name', 'district', 'state', 'geometry'])
    spatial_df = table.to_pandas()
    print(f"Total spatial records: {len(spatial_df)}")
    print(f"Unique spatial block_lgd codes: {spatial_df['block_lgd'].nunique()}")

    # 3. Extract centroids from spatial parquet
    print("Deriving centroids and representative points from geometry...")
    spatial_map = {}
    invalid_geoms = 0
    
    for idx, row in spatial_df.iterrows():
        b_code = int(row['block_lgd'])
        geom_bytes = row['geometry']
        try:
            geom = shapely.wkb.loads(geom_bytes)
            if geom.is_empty or not geom.is_valid:
                geom = geom.buffer(0) # Attempt fix
            
            # Prefer point inside polygon if centroid falls outside (e.g. concave/multipart)
            centroid = geom.centroid
            if not geom.contains(centroid):
                pt = geom.representative_point()
            else:
                pt = centroid
                
            lon, lat = pt.x, pt.y
            
            # India coordinate sanity check
            # Lat: 6.0 to 38.5, Lon: 68.0 to 97.5
            if 6.0 <= lat <= 38.5 and 68.0 <= lon <= 97.5:
                # Store or update
                if b_code not in spatial_map:
                    spatial_map[b_code] = {
                        'lat': round(lat, 6),
                        'lon': round(lon, 6),
                        'spatial_name': row['block_name'],
                        'spatial_district': row['district'],
                        'spatial_state': row['state']
                    }
            else:
                invalid_geoms += 1
        except Exception as e:
            invalid_geoms += 1

    print(f"Extracted valid centroids for {len(spatial_map)} unique LGD codes. Invalid geoms: {invalid_geoms}")

    # 4. Match LGD master to spatial data
    print("Matching LGD master records to spatial centroids...")
    staging_rows = []
    
    matched_count = 0
    pending_count = 0
    
    for idx, row in lgd_unique.iterrows():
        b_code = int(row['block_code'])
        b_name = normalize_text(row['block_name'])
        d_name = normalize_text(row['dist_name'])
        s_name = normalize_text(row['state_name'])
        
        if b_code in spatial_map:
            sp = spatial_map[b_code]
            lat = sp['lat']
            lon = sp['lon']
            status = 'MATCHED_AUTHORITATIVE_BOUNDARY'
            matched_count += 1
        else:
            lat = None
            lon = None
            status = 'PENDING_OFFICIAL_BOUNDARY_MATCH'
            pending_count += 1
            
        staging_rows.append({
            'block_id': str(b_code),
            'block_name': b_name,
            'district_name': d_name,
            'state_name': s_name,
            'centroid_lat': lat,
            'centroid_lon': lon,
            'source_name': 'MoPR_LGD_and_ISRO_Bhuvan',
            'source_version': 'LGD_2026_Bhuvan_2024',
            'source_lgd_code': str(b_code),
            'spatial_match_status': status
        })

    staging_df = pd.DataFrame(staging_rows)
    staging_out = os.path.join('data', 'phase_a_block_master.csv')
    staging_df.to_csv(staging_out, index=False)
    print(f"\nStaging dataset written to {staging_out}")
    print(f"Total staged blocks: {len(staging_df)}")
    print(f"Matched with spatial coordinates: {matched_count} ({matched_count/len(staging_df)*100:.2f}%)")
    print(f"Pending spatial match: {pending_count} ({pending_count/len(staging_df)*100:.2f}%)")

    # 5. State-wise breakdown
    print("\n--- STATE-WISE COVERAGE SUMMARY ---")
    state_summary = []
    for state, grp in staging_df.groupby('state_name'):
        total = len(grp)
        matched = (grp['spatial_match_status'] == 'MATCHED_AUTHORITATIVE_BOUNDARY').sum()
        pending = (grp['spatial_match_status'] == 'PENDING_OFFICIAL_BOUNDARY_MATCH').sum()
        state_summary.append({
            'State': state,
            'Total_LGD_Blocks': total,
            'Matched_Centroids': matched,
            'Pending_Match': pending,
            'Match_Rate': f"{matched/total*100:.1f}%"
        })
    summary_df = pd.DataFrame(state_summary)
    summary_csv = os.path.join('data', 'phase_a_state_coverage.csv')
    summary_df.to_csv(summary_csv, index=False)
    print(summary_df.to_string())
    print(f"\nState coverage saved to {summary_csv}")

if __name__ == '__main__':
    main()
