import {
  ContactShadows,
  OrbitControls,
  PerspectiveCamera,
  RoundedBox,
  Stars,
} from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Group, Mesh } from "three";

const DRIVEWAY_TARGET: [number, number, number] = [0, 0.18, 0.35];

function Snow({
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
    const fall = speed * delta * 5;
    for (let i = 0; i < count; i++) {
      const yi = i * 3 + 1;
      arr[yi] -= fall * (0.65 + (i % 9) * 0.04);
      if (arr[yi] < 0.15) {
        arr[yi] = height + Math.random() * 1.5;
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
        size={0.038}
        color="#e8eef8"
        transparent
        opacity={0.42}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

function YardGround() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.008, -4]} receiveShadow>
      <planeGeometry args={[120, 120]} />
      <meshStandardMaterial
        color="#4e5d72"
        roughness={0.94}
        metalness={0.04}
      />
    </mesh>
  );
}

/** Paved surface: subtle variation */
function Driveway() {
  return (
    <group rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
      <mesh receiveShadow>
        <planeGeometry args={[40, 26]} />
        <meshPhysicalMaterial
          color="#4a505c"
          roughness={0.85}
          metalness={0.06}
          clearcoat={0.12}
          clearcoatRoughness={0.5}
        />
      </mesh>
      {/* Expansion joints */}
      {[...Array(5)].map((_, i) => (
        <mesh key={`v-${i}`} position={[(-16 + i * 8) as number, 0.003, 0]} rotation={[0, 0, 0]}>
          <planeGeometry args={[0.04, 26]} />
          <meshStandardMaterial color="#1a1c20" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

function Curb() {
  return (
    <mesh position={[2.25, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow castShadow>
      <boxGeometry args={[0.42, 32, 0.14]} />
      <meshStandardMaterial color="#4a505a" roughness={0.85} metalness={0.05} />
    </mesh>
  );
}

function Car() {
  const group = useRef<Group>(null);
  useFrame((state) => {
    if (group.current) {
      group.current.position.y = 0.36 + Math.sin(state.clock.elapsedTime * 0.6) * 0.004;
    }
  });
  return (
    <group ref={group} position={[0, 0.36, 1.45]} castShadow>
      <RoundedBox args={[1.95, 0.5, 4.05]} radius={0.09} smoothness={4} castShadow>
        <meshPhysicalMaterial
          color="#1c2130"
          metalness={0.72}
          roughness={0.38}
          clearcoat={0.85}
          clearcoatRoughness={0.15}
        />
      </RoundedBox>
      <RoundedBox
        position={[0, 0.46, -0.28]}
        args={[1.68, 0.4, 2.05]}
        radius={0.07}
        smoothness={3}
        castShadow
      >
        <meshPhysicalMaterial
          color="#252b3d"
          metalness={0.5}
          roughness={0.42}
          clearcoat={0.5}
          clearcoatRoughness={0.25}
        />
      </RoundedBox>
      <mesh position={[0, 0.52, 0.95]} rotation={[0.35, 0, 0]} castShadow>
        <boxGeometry args={[1.6, 0.06, 0.55]} />
        <meshPhysicalMaterial color="#0d0f14" metalness={0.3} roughness={0.2} />
      </mesh>
      {[
        [-0.82, -0.14, 1.2],
        [0.82, -0.14, 1.2],
        [-0.82, -0.14, -1.18],
        [0.82, -0.14, -1.18],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} castShadow>
          <cylinderGeometry args={[0.3, 0.3, 0.2, 24]} />
          <meshStandardMaterial color="#0a0a0a" roughness={0.88} metalness={0.15} />
        </mesh>
      ))}
    </group>
  );
}

function HouseBackdrop() {
  const siding = "#5c6d85";
  const trim = "#4a586c";
  const roof = "#485463";
  return (
    <group position={[-9, 0, -34]}>
      <mesh castShadow position={[0, 3.1, 0]} receiveShadow>
        <boxGeometry args={[15.5, 6.2, 10.5]} />
        <meshStandardMaterial color={siding} roughness={0.82} metalness={0.05} />
      </mesh>
      <mesh castShadow position={[0, 0.55, 5.35]}>
        <boxGeometry args={[15.7, 1.1, 0.35]} />
        <meshStandardMaterial color="#5c4f46" roughness={0.92} />
      </mesh>
      <mesh castShadow position={[1.4, 5.85, 0.4]}>
        <boxGeometry args={[10.5, 3.4, 8.5]} />
        <meshStandardMaterial color={trim} roughness={0.88} />
      </mesh>
      <mesh castShadow position={[1, 7.85, 0.35]} rotation={[0, 0, 0]}>
        <boxGeometry args={[11, 1.0, 9]} />
        <meshStandardMaterial color={roof} roughness={0.94} />
      </mesh>
      <mesh castShadow position={[-5.2, 2, 3.6]}>
        <boxGeometry args={[6.2, 4.0, 6.8]} />
        <meshStandardMaterial color={trim} roughness={0.9} />
      </mesh>
      <mesh position={[-5.2, 2, 6.96]}>
        <planeGeometry args={[5.4, 3.1]} />
        <meshPhysicalMaterial
          color="#151820"
          roughness={0.35}
          metalness={0.45}
          clearcoat={0.9}
          reflectivity={0.4}
        />
      </mesh>
      {[
        [3, 3.2, 5.28],
        [-0.8, 3.2, 5.28],
        [3, 6.2, 5.15],
        [0, 6.2, 5.15],
        [-3.2, 6.2, 5.15],
      ].map((p, i) => (
        <group key={i} position={p as [number, number, number]}>
          <mesh>
            <planeGeometry args={[1.05, 1.2]} />
            <meshStandardMaterial
              color="#ffd9a0"
              emissive="#ff9a3c"
              emissiveIntensity={1.1}
            />
          </mesh>
          <pointLight position={[0, 0, 0.4]} intensity={0.8} distance={3.5} color="#ffcc88" />
        </group>
      ))}
      <mesh castShadow position={[5, 6.8, -1.8]}>
        <boxGeometry args={[1.1, 3.2, 1.1]} />
        <meshStandardMaterial color="#4a4038" roughness={1} />
      </mesh>
      <mesh castShadow position={[1.8, 1, 6.]}>
        <boxGeometry args={[3.8, 2, 2.2]} />
        <meshStandardMaterial color={trim} roughness={0.88} />
      </mesh>
    </group>
  );
}

/** Bare winter trees — simple vertical trunks, no cartoon cones */
function WinterTrees() {
  const pts: [number, number, number][] = [
    [13, 0, 1],
    [15, 0, -8],
    [-12, 0, 5],
    [11, 0, -15],
    [-16, 0, -6],
  ];
  return (
    <group>
      {pts.map((pos, i) => (
        <group key={i} position={pos}>
          <mesh castShadow position={[0, 1.8, 0]}>
            <cylinderGeometry args={[0.12, 0.18, 3.6, 8]} />
            <meshStandardMaterial color="#2a2420" roughness={1} />
          </mesh>
          {[0.9, 1.6, 2.3].map((h, j) => (
            <mesh key={j} position={[0.35, h, 0]} rotation={[0, 0, -0.5]} castShadow>
              <cylinderGeometry args={[0.04, 0.06, 1.2, 6]} />
              <meshStandardMaterial color="#252018" roughness={1} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function HeatingPadMesh({ heatingOn }: { heatingOn: boolean }) {
  const warmRef = useRef<Mesh>(null);
  useFrame((state) => {
    const m = warmRef.current;
    if (!m) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    const t = state.clock.elapsedTime;
    mat.emissiveIntensity = heatingOn ? 0.55 + Math.sin(t * 1.8) * 0.12 : 0.03;
  });
  return (
    <group position={[-0.2, 0.04, -1.78]}>
      <mesh ref={warmRef} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.1, 48]} />
        <meshStandardMaterial
          color="#4a3828"
          emissive="#e86420"
          emissiveIntensity={heatingOn ? 0.5 : 0.03}
          roughness={0.75}
        />
      </mesh>
      {heatingOn ? (
        <pointLight position={[0, 0.15, 0]} intensity={2.2} distance={5} color="#ff7722" />
      ) : null}
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
  const count = Math.min(4200, 1600 + Math.round(snowBoost * 1500));
  /** Winter late afternoon — a step brighter */
  const sky = "#35465a";
  const fogCol = "#3a4c60";

  return (
    <Canvas shadows dpr={[1, 1.75]} gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping }}>
      <color attach="background" args={[sky]} />
      <fog attach="fog" args={[fogCol, 28, 105]} />
      <PerspectiveCamera makeDefault position={[5.8, 1.68, 9.8]} fov={50} near={0.1} far={180} />

      <OrbitControls
        target={DRIVEWAY_TARGET}
        enableDamping
        dampingFactor={0.07}
        minAzimuthAngle={-0.68}
        maxAzimuthAngle={0.68}
        minPolarAngle={0.4}
        maxPolarAngle={1.38}
        minDistance={4.0}
        maxDistance={13}
      />

      <Stars radius={80} depth={40} count={1200} factor={4.5} saturation={0} fade speed={2} />

      <hemisphereLight color="#aabbd4" groundColor="#3a4550" intensity={0.88} />
      <ambientLight intensity={0.32} color="#dce6f4" />

      <directionalLight
        castShadow
        position={[-18, 28, -3]}
        intensity={0.88}
        color="#eef4ff"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.00025}
        shadow-camera-far={85}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
      />

      <directionalLight position={[12, 18, 11]} intensity={0.42} color="#fff2e6" />

      <HeatingPadMesh heatingOn={heatingOn} />
      <YardGround />
      <Driveway />
      <Curb />
      <Car />
      <HouseBackdrop />
      <WinterTrees />
      <Snow count={count} area={44} height={22} speed={0.45 + snowBoost * 0.28} />

      <ContactShadows
        position={[0, 0, 1]}
        opacity={0.24}
        scale={56}
        blur={2.1}
        far={22}
        color="#151820"
      />
    </Canvas>
  );
}
