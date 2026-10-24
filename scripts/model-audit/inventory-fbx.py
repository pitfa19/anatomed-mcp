"""Read-only inventory of all Unity intermediates, including the unconverted reference file."""
import bpy
import json
from pathlib import Path
from mathutils import Vector
ROOT = Path('/Users/fabijanpitlovic/.jcode/scratch/anatomed-audit-20261024-1846/inputs/fbx')
SYSTEMS = {'BodyRegions100.fbx':'regions','CardiovascularSystem22.fbx':'vessels','Joints45.fbx':'joints','MuscularInsertions30.fbx':'insertions','MuscularSystem30.fbx':'muscles','NervousSystem22-55.fbx':'nerves','SkeletalSystem30.fbx':'skeleton','VisceralSystem25.fbx':'organs'}
rows = []
for file in sorted(ROOT.glob('*.fbx')):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(file))
    bpy.context.view_layer.update()
    objects=[]
    for o in bpy.data.objects:
        pts=[o.matrix_world @ Vector(p) for p in o.bound_box] if o.type=='MESH' else []
        objects.append({'name':o.name,'type':o.type,'parent':o.parent.name if o.parent else None,'vertices':len(o.data.vertices) if o.type=='MESH' else None,'polygons':len(o.data.polygons) if o.type=='MESH' else None,'originalCatalogRule':o.type=='MESH' and '-lin' not in o.name and '.labels' not in o.name,'groupGeometryClearedByExporter':o.type=='MESH' and o.name.endswith('.g'),'matrixWorld':[list(r) for r in o.matrix_world],'bounds':[[min(p[i] for p in pts) for i in range(3)],[max(p[i] for p in pts) for i in range(3)]] if pts else None})
    row={'file':file.name,'system':SYSTEMS.get(file.name,'not-converted-reference'),'objects':objects}
    rows.append(row)
    print('JCODE_PROGRESS '+json.dumps({'message':file.name,'objects':len(objects),'catalogRuleCount':sum(o['originalCatalogRule'] for o in objects)}),flush=True)
(ROOT/'inventory.json').write_text(json.dumps({'blender':bpy.app.version_string,'files':rows},indent=2))
print('FBX_INVENTORY_COMPLETE',len(rows),sum(len(r['objects']) for r in rows),flush=True)
