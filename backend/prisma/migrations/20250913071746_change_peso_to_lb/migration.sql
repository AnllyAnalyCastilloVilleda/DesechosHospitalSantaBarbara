/*
  Warnings:

  - You are about to drop the column `pesoKg` on the `RegistroLinea` table. All the data in the column will be lost.
  - Added the required column `pesoLb` to the `RegistroLinea` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."RegistroLinea" DROP COLUMN "pesoKg",
ADD COLUMN     "pesoLb" DECIMAL(8,3) NOT NULL;
