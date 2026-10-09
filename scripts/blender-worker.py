# Local, background-only worker. Receives data through JSON, never executable user code.
import bpy, sys, json, math, os
from mathutils import Vector, Matrix

job_path = sys.argv[sys.argv.index('--') + 1]
with open(job_path, encoding='utf8') as f: job = json.load(f)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.import_scene.gltf(filepath=job['model_path'])
scene = bpy.context.scene
meshes = [o for o in scene.objects if o.type == 'MESH']
if not meshes: raise ValueError('Model contains no mesh objects')
C = Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))

def camera():
    c = bpy.data.objects.new('TripoPluginCamera', bpy.data.cameras.new('TripoPluginCamera'))
    scene.collection.objects.link(c); scene.camera = c
    c.data.type = 'PERSP'; c.data.sensor_fit='VERTICAL'; c.data.lens=c.data.sensor_height/(2*math.tan(math.radians(job.get('fov_degrees',50))/2)); c.data.clip_start = .001; c.data.clip_end = 100000
    if job.get('camera_matrix'):
        a = job['camera_matrix']; m = Matrix([[a[col*4+row] for col in range(4)] for row in range(4)])
        c.matrix_world = C @ m
    else:
        points = [o.matrix_world @ Vector(v) for o in meshes for v in o.bound_box]
        lo = Vector([min(v[i] for v in points) for i in range(3)]); hi = Vector([max(v[i] for v in points) for i in range(3)])
        center = (lo+hi)*.5; radius = max((hi-lo).length*.5, .01)
        directions = {'front':(0,-1,0),'back':(0,1,0),'left':(-1,0,0),'right':(1,0,0),'three_quarter':(1,-1,.6)}
        direction = Vector(directions[job.get('view','three_quarter')]).normalized()
        aspect = job.get('viewport_width',512)/job.get('viewport_height',512)
        vertical = math.radians(job.get('fov_degrees',50)); angle = min(vertical, 2*math.atan(math.tan(vertical/2)*aspect))
        c.location = center + direction * radius/math.sin(angle/2)*1.15
        c.rotation_euler = (center-c.location).to_track_quat('-Z','Y').to_euler()
    bpy.context.view_layer.update()
    m = C.inverted() @ c.matrix_world
    return c, [m[row][col] for col in range(4) for row in range(4)]

def only_select(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects: o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]

def uv_utilization(mesh, resolution=256):
    if not mesh.uv_layers: return None
    uv=mesh.uv_layers.active.data; mask=bytearray(resolution*resolution); outside=False
    mesh.calc_loop_triangles()
    for triangle in mesh.loop_triangles:
        points=[uv[i].uv[:] for i in triangle.loops]
        outside=outside or any(x<0 or x>1 or y<0 or y>1 for x,y in points)
        start=max(0,math.ceil(min(p[1] for p in points)*resolution-.5))
        end=min(resolution-1,math.floor(max(p[1] for p in points)*resolution-.5))
        for row in range(start,end+1):
            y=(row+.5)/resolution; intersections=[]
            for i in range(3):
                a=points[i]; b=points[(i+1)%3]
                if min(a[1],b[1])<=y<max(a[1],b[1]): intersections.append(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]))
            if len(intersections)<2: continue
            left=max(0,math.ceil(min(intersections)*resolution-.5)); right=min(resolution-1,math.floor(max(intersections)*resolution-.5))
            if right>=left: mask[row*resolution+left:row*resolution+right+1]=b'\x01'*(right-left+1)
    return {'fraction':sum(mask)/(resolution*resolution),'method':'UV tile [0,1] raster union','sample_resolution':resolution,'estimated':True,'uv_outside_tile':outside}

def catalog(include_uv=False):
    return [{'name':o.name,'polygon_count':len(o.data.polygons),'triangle_count':sum(max(0,len(p.vertices)-2) for p in o.data.polygons),'has_uv':bool(o.data.uv_layers),'skinned':bool(o.find_armature()),'hidden':o.hide_render,**({'uv_utilization':uv_utilization(o.data)} if include_uv else {})} for o in scene.objects if o.type=='MESH']

result = {'parts':catalog()}
kind = job['kind']
if kind == 'inspect': result={'parts':catalog(include_uv=True)}
elif kind == 'edit_parts':
    for edit in job['edits']:
        objects = [bpy.data.objects.get(n) for n in edit['part_names']]
        if any(o is None or o.type!='MESH' for o in objects): raise ValueError('Unknown mesh part name')
        action = edit['action']
        if action in ['merge','split'] and bpy.data.objects.get(edit['name']) is not None: raise ValueError('Result part name already exists')
        if action != 'hide' and any(o.find_armature() for o in objects): raise ValueError('Structural edits to skinned parts are not supported; edit the unrigged source')
        if action == 'hide':
            for o in objects: o.hide_render = True; o.hide_set(True)
        elif action == 'delete':
            for o in objects: bpy.data.objects.remove(o,do_unlink=True)
        elif action == 'merge':
            if len(objects)<2: raise ValueError('Merge requires at least two parts')
            only_select(objects); bpy.ops.object.join(); bpy.context.object.name = edit['name']
        elif action == 'split':
            if len(objects)!=1: raise ValueError('Split requires exactly one part')
            o=objects[0]; indices=set(edit['face_indices'])
            if not indices or max(indices)>=len(o.data.polygons): raise ValueError('Invalid split face indices')
            if len(indices)==len(o.data.polygons): raise ValueError('Split cannot select the whole mesh')
            only_select([o]); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_mode(type='FACE'); bpy.ops.mesh.select_all(action='DESELECT'); bpy.ops.object.mode_set(mode='OBJECT')
            for p in o.data.polygons: p.select = p.index in indices
            before=set(scene.objects); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.separate(type='SELECTED'); bpy.ops.object.mode_set(mode='OBJECT')
            new=list(set(scene.objects)-before)
            if len(new)!=1: raise ValueError('Split did not create one new part')
            new[0].name=edit['name']
    remaining=[o for o in scene.objects if o.type=='MESH' and not o.hide_render]
    if not remaining: raise ValueError('Edits removed or hid all mesh parts')
    output=os.path.join(job['output_dir'],'edited-model.glb')
    bpy.ops.export_scene.gltf(filepath=output,export_format='GLB',use_visible=True,export_animations=True)
    result={'model_path':output,'parts':catalog()}
elif kind == 'render':
    c,m=camera(); scene.render.engine='CYCLES'; scene.cycles.device='CPU'; scene.cycles.samples=16
    scene.world=bpy.data.worlds.new('World'); scene.world.use_nodes=True; scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.65,.65,.65,1); scene.world.node_tree.nodes['Background'].inputs[1].default_value=.8
    for location,power,size in [((3,-4,6),800,5),((-4,-1,2),400,5),((0,4,5),600,4)]:
        data=bpy.data.lights.new('Softbox','AREA'); data.energy=power; data.shape='DISK'; data.size=size
        light=bpy.data.objects.new('Softbox',data);scene.collection.objects.link(light);light.location=location
    scene.view_settings.view_transform='Standard';scene.render.film_transparent=True
    scene.render.resolution_x=job['viewport_width']*2;scene.render.resolution_y=job['viewport_height']*2;scene.render.resolution_percentage=100
    output=os.path.join(job['output_dir'],'viewport.png'); scene.render.image_settings.file_format='PNG';scene.render.filepath=output;bpy.ops.render.render(write_still=True)
    result.update({'render_path':output,'camera_matrix':m,'fov_degrees':job.get('fov_degrees',50),'viewport_width':job['viewport_width'],'viewport_height':job['viewport_height'],'render_scale':2})
elif kind == 'project_texture':
    c,m=camera(); scene.render.engine='CYCLES'; scene.cycles.device='CPU';scene.cycles.samples=1
    # Shader camera coordinate transform uses render aspect and the same perspective camera as the preview.
    scene.render.resolution_x=job['viewport_width'];scene.render.resolution_y=job['viewport_height'];scene.render.resolution_percentage=100
    preview=bpy.data.images.load(job['image_path']); aspect=job['viewport_width']/job['viewport_height']; fy=1/(2*math.tan(math.radians(job.get('fov_degrees',50))/2)); fx=fy/aspect
    scene.camera=c; deps=bpy.context.evaluated_depsgraph_get(); textures=[]
    for idx,o in enumerate(meshes):
        if not o.data.uv_layers: raise ValueError('Projection requires UVs on every selected mesh')
        if job.get('part_names') and o.name not in job['part_names']: continue
        attr=o.data.attributes.new(name='tripo_visibility',type='FLOAT',domain='FACE')
        for p in o.data.polygons:
            point=o.matrix_world @ p.center; direction=point-c.location; distance=direction.length
            hit,loc,normal,face_index,hit_object,_=scene.ray_cast(deps,c.location,direction.normalized(),distance=distance+1e-4)
            attr.data[p.index].value=1 if hit and hit_object.original==o and abs((loc-c.location).length-distance)<max(1e-4,distance*1e-5) else 0
        image=bpy.data.images.new('TripoBakedTexture',width=job['resolution'],height=job['resolution'],alpha=True)
        if not o.data.materials: o.data.materials.append(bpy.data.materials.new('Material'))
        for slot in o.material_slots:
            mat=slot.material.copy() if slot.material else bpy.data.materials.new('Material');slot.material=mat;mat.use_nodes=True;nodes=mat.node_tree.nodes;links=mat.node_tree.links
            bsdf=next((n for n in nodes if n.type=='BSDF_PRINCIPLED'),None);base=bsdf.inputs['Base Color'] if bsdf else None
            source=base.links[0].from_socket if base and base.is_linked else None; color=base.default_value[:] if base else (.8,.8,.8,1)
            def mathnode(op,a,b):
                n=nodes.new('ShaderNodeMath');n.operation=op
                for socket,value in zip(n.inputs,[a,b]):
                    if isinstance(value,(int,float)):socket.default_value=value
                    else:links.new(value,socket)
                return n.outputs[0]
            geo=nodes.new('ShaderNodeNewGeometry');transform=nodes.new('ShaderNodeVectorTransform');transform.vector_type='POINT';transform.convert_from='WORLD';transform.convert_to='CAMERA';links.new(geo.outputs['Position'],transform.inputs[0]);sep=nodes.new('ShaderNodeSeparateXYZ');links.new(transform.outputs[0],sep.inputs[0]);negz=mathnode('MULTIPLY',sep.outputs[2],-1)
            x=mathnode('ADD',mathnode('MULTIPLY',mathnode('DIVIDE',sep.outputs[0],negz),fx),.5);y=mathnode('ADD',mathnode('MULTIPLY',mathnode('DIVIDE',sep.outputs[1],negz),fy),.5)
            vector=nodes.new('ShaderNodeCombineXYZ');links.new(x,vector.inputs[0]);links.new(y,vector.inputs[1]);tex=nodes.new('ShaderNodeTexImage');tex.image=preview;tex.extension='CLIP';links.new(vector.outputs[0],tex.inputs['Vector'])
            visible=nodes.new('ShaderNodeAttribute');visible.attribute_name='tripo_visibility'
            weight=mathnode('MULTIPLY',visible.outputs['Fac'],job['strength'])
            for coordinate in [x,y]:
                weight=mathnode('MULTIPLY',weight,mathnode('GREATER_THAN',coordinate,0));weight=mathnode('MULTIPLY',weight,mathnode('LESS_THAN',coordinate,1))
            weight=mathnode('MULTIPLY',weight,tex.outputs['Alpha']);mix=nodes.new('ShaderNodeMixRGB');links.new(weight,mix.inputs[0])
            if source:links.new(source,mix.inputs[1])
            else:mix.inputs[1].default_value=color
            links.new(tex.outputs['Color'],mix.inputs[2]);emission=nodes.new('ShaderNodeEmission');links.new(mix.outputs[0],emission.inputs['Color']);out=next(n for n in nodes if n.type=='OUTPUT_MATERIAL');links.new(emission.outputs[0],out.inputs['Surface'])
            target=nodes.new('ShaderNodeTexImage');target.image=image;nodes.active=target
        only_select([o]);bpy.ops.object.bake(type='EMIT',margin=4,use_clear=True)
        output=os.path.join(job['output_dir'],f'part-{idx}.png');image.filepath_raw=output;image.file_format='PNG';image.save();textures.append({'part_name':o.name,'image_path':output})
    if not textures: raise ValueError('No matching parts selected')
    result={'textures':textures,'camera_matrix':m,'visibility_method':'face-center ray cast','warnings':['Very large triangles crossing an occlusion boundary need subdivision for accurate projection.','Local projection approximates Studio viewport baking; inspect the model before applying.']}
else: raise ValueError('Unknown worker operation')
with open(os.path.join(job['output_dir'],'result.json'),'w',encoding='utf8') as f:json.dump(result,f)
