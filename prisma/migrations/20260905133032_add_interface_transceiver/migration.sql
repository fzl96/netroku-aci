-- AlterTable
ALTER TABLE "interface_sample" ADD COLUMN     "guiCiscoEID" TEXT,
ADD COLUMN     "guiCiscoPID" TEXT,
ADD COLUMN     "guiSN" TEXT;

-- AlterTable
ALTER TABLE "interface_snapshot" ADD COLUMN     "guiCiscoEID" TEXT,
ADD COLUMN     "guiCiscoPID" TEXT,
ADD COLUMN     "guiSN" TEXT;
