/*
  Warnings:

  - Made the column `tipoDesechoId` on table `Bolsa` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "public"."Bolsa" DROP CONSTRAINT "Bolsa_tipoDesechoId_fkey";

-- AlterTable
ALTER TABLE "public"."Bolsa" ALTER COLUMN "tipoDesechoId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."Bolsa" ADD CONSTRAINT "Bolsa_tipoDesechoId_fkey" FOREIGN KEY ("tipoDesechoId") REFERENCES "public"."TipoDesecho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
