import {
  ContactShadows,
  OrbitControls,
  PerspectiveCamera,
  RoundedBox,
  Sparkles,
  Stars,
} from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Group, Mesh } from "three";

const VIEW_TARGET: [number, number, number] = [0, 0.16, 0.32];

function SnowField({
  count,
  area,
  height,
  speed,
}: {
  count: number;
  area: number;
  height: number;
  speed: number;
}) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      p[i * 3] = (Math.random() - 0.5) * area;
      p[i * 3 + 1] = Math.random() * height;
      p[i * 3 + 2] = (Math.random() - 0.5) * area;
    }
    return p;
  }, [count, area, height]);

  useFrame((_, delta) => {
    const pts = ref.current;
    if (!pts) return;
    const attr = pts.geometry.attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const fall = speed * delta * 5.2;
    for (let i = 0; i < count; i++) {
      const yi = i * 3 + 1;
      arr[yi] -= fall * (0.55 + (i % 11) * 0.035);
      if (arr[yi] < 0.12) {
        arr[yi] = height + Math.random() * 2;
        arr[i * 3] = (Math.random() - 0.5) * area;
        arr[i * 3 + 2] = (Math.random() - 0.5) * area;
      }
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.028}
        color="#b8dcff"
        transparent
        opacity={0.38}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

function VoidGround() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.012, -3.5]} receiveShadow>
      <planeGeometry args={[140, 140]} />
      <meshStandardMaterial color="#a8bdd4" roughness={0.92} metalness={0.02} />
    </mesh>
  );
}

/** Glossy wet asphalt strip */
function DrivewaySlab() {
  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
      <mesh receiveShadow>
        <planeGeometry args={[42, 28]} />
        <meshPhysicalMaterial
          color="#5c6778"
          roughness={0.42}
          metalness={0.18}
          clearcoat={0.75}
          clearcoatRoughness={0.22}
          reflectivity={0.65}
        />
      </mesh>
      {/* faint lane groove accents */}
      {[-12, -4, 4, 12].map((x) => (
        <mesh key={x} position={[x, 0.002, 0]}>
          <planeGeometry args={[0.025, 28]} />
          <meshStandardMaterial color="#07090c" roughness={0.95} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}

/** Heated zone: concentric rings + coil illusion */
function HeatedMat({ heatingOn }: { heatingOn: boolean }) {
  const warmRef = useRef<Mesh>(null);
  const ringRefs = useRef<Mesh[]>([]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const m = warmRef.current;
    if (m) {
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = heatingOn ? 0.75 + Math.sin(t * 2.2) * 0.18 : 0.04;
    }
    ringRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const mm = mesh.material as THREE.MeshStandardMaterial;
      mm.emissiveIntensity = heatingOn ? 0.15 + Math.sin(t * 3 + i) * 0.06 : 0.01;
    });
  });

  const rings = [2.35, 1.7, 1.05, 0.52];
  return (
    <group position={[-0.15, 0.038, -1.72]}>
      <mesh ref={warmRef} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.28, 64]} />
        <meshStandardMaterial
          color="#1a1410"
          emissive="#ff5a1a"
          emissiveIntensity={heatingOn ? 0.6 : 0.04}
          roughness={0.55}
        />
      </mesh>
      {rings.map((r, i) => (
        <mesh
          key={r}
          ref={(el) => {
            if (el) ringRefs.current[i] = el;
          }}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.01, 0]}
        >
          <ringGeometry args={[r - 0.04, r, 48]} />
          <meshStandardMaterial
            color="#2a1810"
            emissive={heatingOn ? "#ff3d00" : "#1a100c"}
            emissiveIntensity={heatingOn ? 0.35 : 0.02}
            roughness={0.42}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
      {heatingOn ? (
        <>
          <pointLight position={[0, 0.2, 0]} intensity={3.2} distance={6} color="#ff4f21" decay={2} />
          <Sparkles
            count={55}
            scale={[4.2, 0.8, 4.2]}
            size={1.8}
            speed={0.35}
            opacity={0.85}
            color="#ff9a5c"
            position={[0, 0.15, 0]}
          />
        </>
      ) : null}
    </group>
  );
}

function IonCurb() {
  return (
    <mesh position={[2.35, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow castShadow>
      <boxGeometry args={[0.38, 34, 0.16]} />
      <meshStandardMaterial color="#94a3b8" roughness={0.55} metalness={0.15} />
    </mesh>
  );
}

/** Low vehicle: wedge silhouette, cyan glass */
function Vehicle() {
  const group = useRef<Group>(null);
  useFrame((state) => {
    if (group.current) {
      group.current.position.y = 0.34 + Math.sin(state.clock.elapsedTime * 0.55) * 0.003;
    }
  });
  return (
    <group ref={group} position={[0.1, 0.34, 1.4]} castShadow>
      <RoundedBox args={[2.15, 0.46, 4.2]} radius={0.11} smoothness={3} castShadow>
        <meshPhysicalMaterial
          color="#334155"
          metalness={0.82}
          roughness={0.28}
          clearcoat={0.9}
          clearcoatRoughness={0.12}
        />
      </RoundedBox>
      <RoundedBox position={[0, 0.42, -0.26]} args={[1.75, 0.38, 2.1]} radius={0.06} smoothness={2} castShadow>
        <meshPhysicalMaterial
          color="#1e293b"
          metalness={0.7}
          roughness={0.32}
          emissive="#0c4a6e"
          emissiveIntensity={0.22}
        />
      </RoundedBox>
      <mesh position={[0, 0.48, 0.88]} rotation={[0.4, 0, 0]} castShadow>
        <boxGeometry args={[1.55, 0.05, 0.48]} />
        <meshPhysicalMaterial color="#050810" metalness={0.5} roughness={0.15} transmission={0.15} thickness={0.2} />
      </mesh>
      {[
        [-0.88, -0.13, 1.15],
        [0.88, -0.13, 1.15],
        [-0.88, -0.13, -1.12],
        [0.88, -0.13, -1.12],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} castShadow>
          <cylinderGeometry args={[0.31, 0.31, 0.18, 20]} />
          <meshStandardMaterial color="#050505" roughness={0.9} metalness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

/** Minimal brutalist massing · single ion-lit aperture */
function BrutalistHouse() {
  return (
    <group position={[-10, 0, -36]}>
      <mesh castShadow position={[0, 3.4, 0]} receiveShadow>
        <boxGeometry args={[16.5, 6.8, 12]} />
        <meshStandardMaterial color="#8b9db5" roughness={0.82} metalness={0.05} />
      </mesh>
      <mesh castShadow position={[0, 6.85, 0.5]}>
        <boxGeometry args={[12, 3.2, 10]} />
        <meshStandardMaterial color="#7c8fa3" roughness={0.88} />
      </mesh>
      <mesh position={[-4.5, 2.5, 6.15]}>
        <planeGeometry args={[5, 3.8]} />
        <meshPhysicalMaterial
          color="#164e63"
          emissive="#22d3ee"
          emissiveIntensity={0.65}
          roughness={0.25}
          metalness={0.4}
          clearcoat={0.9}
        />
      </mesh>
      <pointLight position={[-4.5, 2.5, 8]} intensity={2.4} distance={16} color="#e0f2fe" decay={2} />
      {[
        [3.2, 4.2, 5.8],
        [-1, 4.2, 5.8],
      ].map((p, i) => (
        <group key={i} position={p as [number, number, number]}>
          <mesh>
            <planeGeometry args={[0.9, 1.05]} />
            <meshStandardMaterial color="#fff7ed" emissive="#fdba74" emissiveIntensity={0.85} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function SentinelTrees() {
  const positions: [number, number, number][] = [
    [14, 0, 2],
    [16, 0, -9],
    [-13, 0, 6],
    [12, 0, -16],
    [-17, 0, -5],
  ];
  return (
    <group>
      {positions.map((pos, i) => (
        <group key={i} position={pos}>
          <mesh castShadow position={[0, 2.4, 0]}>
            <cylinderGeometry args={[0.1, 0.16, 4.8, 8]} />
            <meshStandardMaterial color="#475569" roughness={1} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function DrivewayCanvas({
  snowBoost,
  heatingOn,
}: {
  snowBoost: number;
  heatingOn: boolean;
}) {
  const count = Math.min(4800, 1600 + Math.round(snowBoost * 1700));
  const sky = "#c2daf4";
  const fogNear = 28;
  const fogFar = 128;

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.22 }}
    >
      <color attach="background" args={[sky]} />
      <fog attach="fog" args={["#cfe2f7", fogNear, fogFar]} />

      <PerspectiveCamera makeDefault position={[6.2, 1.72, 10.4]} fov={48} near={0.1} far={200} />

      <OrbitControls
        target={VIEW_TARGET}
        enableDamping
        dampingFactor={0.075}
        minAzimuthAngle={-0.72}
        maxAzimuthAngle={0.72}
        minPolarAngle={0.38}
        maxPolarAngle={1.36}
        minDistance={4.2}
        maxDistance={14}
      />

      <Stars radius={100} depth={50} count={900} factor={2.4} saturation={0.08} fade speed={1.5} />

      <hemisphereLight color="#e8f4fc" groundColor="#9fb4cc" intensity={0.62} />
      <ambientLight intensity={0.42} color="#dbeafe" />

      <directionalLight
        castShadow
        position={[-28, 38, -10]}
        intensity={0.95}
        color="#fffbeb"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.00022}
        shadow-camera-far={95}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
      />

      <directionalLight position={[18, 22, 14]} intensity={0.38} color="#bfdbfe" />
      <directionalLight position={[-10, 16, 10]} intensity={0.32} color="#fef3c7" />

      <HeatedMat heatingOn={heatingOn} />
      <VoidGround />
      <DrivewaySlab />
      <IonCurb />
      <Vehicle />
      <BrutalistHouse />
      <SentinelTrees />
      <SnowField count={count} area={46} height={24} speed={0.42 + snowBoost * 0.32} />

      <ContactShadows position={[0, 0, 0.5]} opacity={0.28} scale={60} blur={2.2} far={24} color="#334155" />
    </Canvas>
  );
}
