# image เดียวรวมหน้าเว็บกับ API deploy ที่ไหนก็ได้ที่รัน Docker
# ขั้น build ใช้ dev dependency ได้เต็มที่ ส่วนขั้นสุดท้ายมีเฉพาะสิ่งที่ใช้ตอนรันจริง

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/curricula/package.json packages/curricula/package.json

FROM base AS build
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
COPY packages packages
RUN cd apps/web && pnpm exec vite build --mode api

FROM base AS runtime
# ลบ cache ของ pnpm และ corepack ใน RUN เดียวกัน ไม่งั้นยังค้างอยู่ใน layer ก่อนหน้า
RUN pnpm install --frozen-lockfile --prod --filter "@cp/api..." \
  && rm -rf /root/.local/share/pnpm /root/.cache
# Node รัน TypeScript ได้โดยตรง จึงคัดลอก source ไม่ต้อง compile
COPY apps/api/src apps/api/src
COPY apps/api/drizzle apps/api/drizzle
COPY apps/api/docker-start.sh apps/api/docker-start.sh
COPY packages/core/src packages/core/src
COPY packages/contracts/src packages/contracts/src
COPY packages/curricula/data packages/curricula/data
COPY --from=build /app/apps/web/dist web
WORKDIR /app/apps/api
ENV NODE_ENV=production WEB_ROOT=/app/web PORT=8080
EXPOSE 8080
USER node
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=6 \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["sh", "docker-start.sh"]
