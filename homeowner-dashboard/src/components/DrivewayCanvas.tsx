import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Sky } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";

function Snow({ count, area, height, speed }: { count: number; area: number; height: number; speed: number }) {
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
    const fall = speed * delta * 4.5;
    for (let i = 0; i < count; i++) {
      const yi = i * 3 + 1;
      arr[yi] -= fall * (0.7 + (i % 7) * 0.04);
      if (arr[yi] < 0.1) {
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
      <pointsMaterial size={0.05} color="#f1f5f9" transparent opacity={0.55} depthWrite={false} sizeAttenuation />
    </points>
  );
}

function StreetLight({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.8, 0]}>
        <cylinderGeometry args={[0.05, 0.06, 3.2, 10]} />
        <meshStandardMaterial color="#111827" roughness={0.9} />
      </mesh>
      <mesh position={[0, 3.3, 0.3]}>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshStandardMaterial emissive="#fde68a" emissiveIntensity={0.45} color="#fefce8" />
      </mesh>
      <pointLight position={[0, 3.3, 0.3]} intensity={0.8} distance={6.5} color="#fde68a" />
    </group>
  );
}

function DrivewayScene({ heatingOn, snowBoost }: { heatingOn: boolean; snowBoost: number }) {
  const padRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (padRef.current) {
      const m = padRef.current.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = heatingOn ? 0.6 + Math.sin(t * 2) * 0.15 : 0.08;
    }
  });

  return (
    <>
      <Sky distance={450000} sunPosition={[6, 8, 4]} inclination={0.55} azimuth={0.25} turbidity={8} rayleigh={1.4} />
      <hemisphereLight args={["#e0f2fe", "#dbeafe", 0.9]} />
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[8, 13, 6]}
        intensity={1.25}
        color="#fff7ed"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.1}
        shadow-camera-far={40}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#f1f5f9" roughness={0.98} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[8, 16]} />
        <meshPhysicalMaterial color="#4b5563" roughness={0.9} metalness={0.04} clearcoat={0.08} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-4.8, 0.02, 0]} receiveShadow>
        <planeGeometry args={[2.2, 16]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.95} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[4.8, 0.02, 0]} receiveShadow>
        <planeGeometry args={[2.2, 16]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.95} />
      </mesh>

      <mesh ref={padRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -2]}>
        <circleGeometry args={[2.4, 64]} />
        <meshStandardMaterial color="#7c2d12" emissive="#f97316" emissiveIntensity={heatingOn ? 0.7 : 0.08} roughness={0.7} />
      </mesh>

      <mesh position={[0, 1.5, -8]} castShadow>
        <boxGeometry args={[8, 3, 4]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.8} />
      </mesh>

      <mesh position={[0, 3.4, -8]} castShadow>
        <boxGeometry args={[9, 1.2, 5]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.9} />
      </mesh>

      <mesh position={[-2.4, 1.5, -6.1]}>
        <planeGeometry args={[1.2, 1]} />
        <meshStandardMaterial emissive="#fed7aa" emissiveIntensity={0.9} color="#fff7ed" />
      </mesh>
      <mesh position={[2.4, 1.5, -6.1]}>
        <planeGeometry args={[1.2, 1]} />
        <meshStandardMaterial emissive="#fee2b6" emissiveIntensity={0.8} color="#fff7ed" />
      </mesh>

      <StreetLight x={-4} z={4} />
      <StreetLight x={4} z={4} />
      <StreetLight x={-4} z={-4} />

      <Snow count={2200} area={26} height={16} speed={0.28 + snowBoost * 0.22} />
    </>
  );
}

export function DrivewayCanvas({
  snowBoost,
  heatingOn,
}: {
  snowBoost: number;
  heatingOn: boolean;
}) {
  return (
    <Canvas
      shadows
      gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.35 }}
    >
      <color attach="background" args={["#bfdbfe"]} />
      <fog attach="fog" args={["#dbeafe", 16, 38]} />
      <PerspectiveCamera makeDefault position={[8, 6, 10]} fov={45} />
      <DrivewayScene heatingOn={heatingOn} snowBoost={snowBoost} />
      <OrbitControls
        enablePan
        enableZoom
        minDistance={7}
        maxDistance={22}
        minPolarAngle={0.55}
        maxPolarAngle={1.48}
        target={[0, 1.2, -2]}
      />
    </Canvas>
  );
}
