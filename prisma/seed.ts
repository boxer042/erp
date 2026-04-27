import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const channels = [
    { name: "쿠팡", code: "COUPANG", commissionRate: 0.108 },
    { name: "네이버", code: "NAVER", commissionRate: 0.055 },
    { name: "자사몰", code: "OWN", commissionRate: 0 },
    { name: "오프라인", code: "OFFLINE", commissionRate: 0 },
  ];

  for (const channel of channels) {
    await prisma.salesChannel.upsert({
      where: { code: channel.code },
      update: {},
      create: channel,
    });
  }

  console.log("시드 데이터 생성 완료:");
  console.log("- 판매 채널 4개 (쿠팡, 네이버, 자사몰, 오프라인)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
