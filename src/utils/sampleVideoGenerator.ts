/**
 * Utility to generate realistic sample test video files dynamically in the browser
 * using HTML5 Canvas and MediaRecorder.
 * Supports generating 4 distinct bus route videos with varying vehicle densities for traffic congestion testing.
 */

export interface SampleVideoOption {
  id: string;
  name: string;
  fileName: string;
  durationSec: number;
  description: string;
  sceneType: 'downtown' | 'highway' | 'bottleneck' | 'expressway';
  defaultBusId: string;
  defaultRouteName: string;
  expectedCongestion: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export const SAMPLE_VIDEOS: SampleVideoOption[] = [
  {
    id: 'sample-a',
    name: 'Video 1: Route 1 - Avinashi Arterial Heavy Traffic',
    fileName: 'route1_avinashi_heavy_traffic.mp4',
    durationSec: 4.0,
    description: 'High-density urban street with multiple passenger sedans, motorcyclist, and curb pedestrian.',
    sceneType: 'downtown',
    defaultBusId: 'BUS-101',
    defaultRouteName: 'Route 1 - North-South Express',
    expectedCongestion: 'HIGH'
  },
  {
    id: 'sample-b',
    name: 'Video 2: Route 4 - Trichy Road Commercial Fleet',
    fileName: 'route4_trichy_commercial_flow.mp4',
    durationSec: 5.0,
    description: 'Moderate commercial traffic with freight trucks, utility vans, and continuous movement.',
    sceneType: 'highway',
    defaultBusId: 'BUS-102',
    defaultRouteName: 'Route 4 - City Loop South',
    expectedCongestion: 'MEDIUM'
  },
  {
    id: 'sample-c',
    name: 'Video 3: Route 12 - Airport Corridor Bottleneck',
    fileName: 'route12_airport_bottleneck_gridlock.mp4',
    durationSec: 4.5,
    description: 'Severe traffic queue near flyover cross. Densely packed stationary vehicles and slow crawl.',
    sceneType: 'bottleneck',
    defaultBusId: 'BUS-103',
    defaultRouteName: 'Route 12 - Airport Arterial Corridor',
    expectedCongestion: 'CRITICAL'
  },
  {
    id: 'sample-d',
    name: 'Video 4: Route 7 - Tech Park Ring Expressway',
    fileName: 'route7_techpark_free_express.mp4',
    durationSec: 4.0,
    description: 'Free-flowing multi-lane corridor with distant vehicle and high average operating speed.',
    sceneType: 'expressway',
    defaultBusId: 'BUS-105',
    defaultRouteName: 'Route 7 - Tech Park Ring',
    expectedCongestion: 'LOW'
  }
];

export async function generateSyntheticTestVideo(
  sceneType: 'downtown' | 'highway' | 'bottleneck' | 'expressway',
  durationSec: number,
  fileName: string
): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d')!;

  // Check MediaRecorder support
  const stream = canvas.captureStream(25);
  let mimeType = 'video/webm';
  if (MediaRecorder.isTypeSupported('video/mp4')) {
    mimeType = 'video/mp4';
  } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
    mimeType = 'video/webm;codecs=vp9';
  } else if (MediaRecorder.isTypeSupported('video/webm')) {
    mimeType = 'video/webm';
  }

  const recordedChunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, { mimeType });

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  const totalFrames = Math.round(durationSec * 25);
  let currentFrame = 0;

  return new Promise((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: mimeType });
      const file = new File([blob], fileName, { type: mimeType, lastModified: Date.now() });
      resolve(file);
    };

    recorder.start(100);

    const interval = setInterval(() => {
      currentFrame++;
      const progress = currentFrame / totalFrames;

      // Draw Scene based on sceneType
      if (sceneType === 'downtown') {
        // Downtown scene: dark blue sky, skyline, asphalt road, blue sedan with license plate
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, 640, 160);

        // Buildings
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(20, 40, 90, 120);
        ctx.fillRect(130, 20, 110, 140);
        ctx.fillRect(260, 60, 80, 100);
        ctx.fillRect(360, 30, 120, 130);
        ctx.fillRect(500, 50, 110, 110);

        // Road
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 160, 640, 200);

        // Road markings
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2;
        const dashOffset = (currentFrame * 14) % 40;
        for (let y = 160; y < 360; y += 30) {
          ctx.beginPath();
          ctx.moveTo(320, y + dashOffset);
          ctx.lineTo(320, y + dashOffset + 15);
          ctx.stroke();
        }

        // Ahead Vehicle (Blue sedan)
        const carX = 260 + Math.sin(progress * Math.PI * 2) * 15;
        const carY = 220;
        ctx.fillStyle = '#1e3a8a';
        ctx.fillRect(carX, carY, 110, 65);
        ctx.fillStyle = '#1d4ed8';
        ctx.fillRect(carX + 12, carY - 20, 86, 25);
        // Taillights
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(carX + 6, carY + 24, 14, 10);
        ctx.fillRect(carX + 90, carY + 24, 14, 10);
        // Plate
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(carX + 32, carY + 30, 46, 14);
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 8px monospace';
        ctx.fillText('KA 01 MJ 8821', carX + 34, carY + 40);

        // Overtaking car in right lane
        ctx.fillStyle = '#059669';
        ctx.fillRect(440, 240, 95, 55);
        ctx.fillStyle = '#10b981';
        ctx.fillRect(440 + 10, 225, 75, 20);

        // Motorcycle in left lane
        ctx.fillStyle = '#e11d48';
        ctx.fillRect(160, 250, 25, 45);

        // Pedestrian near curb
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.arc(80, 240, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(78, 246, 4, 16);

        // Overlay text
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(10, 10, 310, 26);
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(`BUS-101 | ROUTE 1 ARTERIAL | ${(progress * durationSec).toFixed(1)}s`, 16, 28);

      } else if (sceneType === 'bottleneck') {
        // Bottleneck Gridlock Scene (Airport Corridor / Lakshmi Mills Flyover)
        ctx.fillStyle = '#090d16';
        ctx.fillRect(0, 0, 640, 150);

        // Flyover Pillars & Concrete Overpass
        ctx.fillStyle = '#334155';
        ctx.fillRect(0, 110, 640, 35);
        ctx.fillStyle = '#475569';
        ctx.fillRect(120, 140, 45, 120);
        ctx.fillRect(480, 140, 45, 120);

        // Jammed Road
        ctx.fillStyle = '#182030';
        ctx.fillRect(0, 150, 640, 210);

        // Standstill queue of 4 tightly spaced cars
        // Car 1 (Center)
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(250, 230, 120, 70);
        ctx.fillStyle = '#b91c1c';
        ctx.fillRect(265, 210, 90, 25);

        // Car 2 (Left Lane Tailgating)
        ctx.fillStyle = '#d97706';
        ctx.fillRect(110, 240, 105, 65);

        // Car 3 (Right Lane)
        ctx.fillStyle = '#2563eb';
        ctx.fillRect(410, 235, 115, 68);

        // Car 4 (Ahead in Queue)
        ctx.fillStyle = '#475569';
        ctx.fillRect(270, 175, 80, 45);

        // Brake lights glowing bright red (standstill queue)
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(255, 260, 18, 14);
        ctx.fillRect(347, 260, 18, 14);
        ctx.fillRect(115, 265, 16, 12);
        ctx.fillRect(195, 265, 16, 12);

        // Slow bumper crawl offset
        const slowJitter = Math.sin(currentFrame * 0.1) * 2;
        ctx.translate(slowJitter, 0);

        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(10, 10, 320, 26);
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(`BUS-103 | ROUTE 12 BOTTLENECK: ${(progress * durationSec).toFixed(1)}s`, 16, 28);
        ctx.setTransform(1, 0, 0, 1, 0, 0);

      } else if (sceneType === 'expressway') {
        // High speed expressway (Tech Park Ring) - Clean asphalt, light traffic
        ctx.fillStyle = '#041e42';
        ctx.fillRect(0, 0, 640, 150);

        // Green trees & landscape
        ctx.fillStyle = '#064e3b';
        ctx.fillRect(0, 140, 640, 30);

        // Wide 4-lane smooth highway
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 160, 640, 200);

        // Fast moving lane lines
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        const fastOffset = (currentFrame * 32) % 60;
        for (let laneX of [210, 430]) {
          for (let y = 160; y < 360; y += 40) {
            ctx.beginPath();
            ctx.moveTo(laneX, y + fastOffset);
            ctx.lineTo(laneX, y + fastOffset + 24);
            ctx.stroke();
          }
        }

        // Only 1 distant sedan cruising smoothly ahead
        const distCarX = 300;
        const distCarY = 200 + Math.sin(progress * Math.PI) * 4;
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(distCarX, distCarY, 70, 42);

        // Overlay text
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(10, 10, 310, 26);
        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(`BUS-105 | ROUTE 7 TECH PARK: ${(progress * durationSec).toFixed(1)}s`, 16, 28);

      } else {
        // Highway commercial scene (Trichy Rd): red truck & utility car
        const skyGrad = ctx.createLinearGradient(0, 0, 0, 150);
        skyGrad.addColorStop(0, '#7c2d12');
        skyGrad.addColorStop(1, '#ea580c');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, 640, 150);

        // Distant mountains
        ctx.fillStyle = '#431407';
        ctx.beginPath();
        ctx.moveTo(0, 150);
        ctx.lineTo(120, 90);
        ctx.lineTo(240, 150);
        ctx.lineTo(380, 80);
        ctx.lineTo(520, 150);
        ctx.lineTo(640, 110);
        ctx.lineTo(640, 150);
        ctx.closePath();
        ctx.fill();

        // Highway
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 150, 640, 210);

        // White Lane dividers
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        const dashOffset = (currentFrame * 22) % 50;
        for (let laneX of [160, 320, 480]) {
          for (let y = 150; y < 360; y += 35) {
            ctx.beginPath();
            ctx.moveTo(laneX, y + dashOffset);
            ctx.lineTo(laneX, y + dashOffset + 18);
            ctx.stroke();
          }
        }

        // Freight Truck in right lane
        const truckX = 390;
        const truckY = 190 + Math.sin(progress * Math.PI) * 8;
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(truckX, truckY, 95, 85);
        ctx.fillStyle = '#991b1b';
        ctx.fillRect(truckX + 15, truckY + 10, 65, 42);
        // Taillights
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(truckX + 8, truckY + 70, 12, 8);
        ctx.fillRect(truckX + 75, truckY + 70, 12, 8);

        // Car in center lane
        const carX = 220;
        const carY = 230;
        ctx.fillStyle = '#64748b';
        ctx.fillRect(carX, carY, 65, 42);

        // Waterlogged puddle on right shoulder
        ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
        ctx.beginPath();
        ctx.ellipse(540, 305, 40, 15, 0, 0, Math.PI * 2);
        ctx.fill();

        // Timestamp overlay
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(10, 10, 310, 26);
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(`BUS-102 | ROUTE 4 COMMERCIAL: ${(progress * durationSec).toFixed(1)}s`, 16, 28);
      }

      if (currentFrame >= totalFrames) {
        clearInterval(interval);
        recorder.stop();
      }
    }, 40);
  });
}
