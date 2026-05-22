/*
  Warnings:

  - You are about to drop the column `game` on the `PlaySession` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "PlaySession_userId_game_idx";

-- AlterTable
ALTER TABLE "PlaySession" DROP COLUMN "game";

-- CreateIndex
CREATE INDEX "PlaySession_userId_idx" ON "PlaySession"("userId");
