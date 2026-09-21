import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, Length, Matches, IsInt, Min, Max, IsIn, IsArray, IsOptional, IsBoolean, ArrayMinSize, ArrayMaxSize, ArrayUnique } from 'class-validator';
export class PartDto {
  @ApiProperty() @IsString() @Length(1, 200) name!: string;
  @ApiProperty() @IsString() @Length(1, 64) sku!: string;
  @ApiProperty() @IsString() @Matches(/^\d{1,12}(\.\d{1,2})?$/) purchasePrice!: string;
  @ApiProperty() @IsString() @Matches(/^\d{1,12}(\.\d{1,2})?$/) salePrice!: string;
}
export class ReceiveDto {
  @ApiProperty() @IsString() @Length(1, 100) branchId!: string;
  @ApiProperty() @IsString() @Length(1, 100) partId!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(1000000) quantity!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1,100) supplierId?: string;
  @ApiProperty() @IsString() @Length(3, 1000) reason!: string;
}
export class AdjustDto {
  @ApiProperty() @IsString() @Length(1, 100) branchId!: string;
  @ApiProperty() @IsString() @Length(1, 100) partId!: string;
  @ApiProperty() @IsInt() @Min(-1000000) @Max(1000000) quantity!: number;
  @ApiProperty() @IsString() @Length(3, 1000) reason!: string;
}
export class TransferDto {
  @ApiProperty() @IsString() @Length(1, 100) fromBranchId!: string;
  @ApiProperty() @IsString() @Length(1, 100) toBranchId!: string;
  @ApiProperty() @IsString() @Length(1, 100) partId!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(1000000) quantity!: number;
  @ApiProperty() @IsString() @Length(3, 1000) reason!: string;
}
export class StockMoveDto {
  @ApiProperty() @IsString() @Length(1, 100) branchId!: string;
  @ApiProperty() @IsString() @Length(1, 100) partId!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(1000000) quantity!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100) supplierId?: string;
  @ApiProperty() @IsString() @Length(3, 1000) reason!: string;
}
export class ReserveDto {
  @ApiProperty() @IsString() @Length(1, 100) partId!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(1000000) quantity!: number;
}
export class PaymentDto {
  @ApiProperty() @IsString() @Matches(/^\d{1,12}(\.\d{1,2})?$/) amount!: string;
  @ApiProperty() @IsString() @Length(1,64) @Matches(/^[A-Z0-9_]+$/) method!: string;
  @ApiProperty() @IsString() @Length(16, 128) idempotencyKey!: string;
}
export class RefundDto {
  @ApiProperty() @IsString() @Matches(/^\d{1,12}(\.\d{1,2})?$/) amount!: string;
  @ApiProperty() @IsString() @Length(3, 1000) reason!: string;
  @ApiProperty() @IsString() @Length(16, 128) idempotencyKey!: string;
}
export class FinishDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @ArrayUnique() @IsString({ each: true }) passedChecks!: string[];
}
export class DeliverDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowDebt?: boolean;
  @ApiPropertyOptional({type:[String]}) @IsOptional() @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsString({each:true}) coveredOrderPartIds?: string[];
  @ApiPropertyOptional({type:[String]}) @IsOptional() @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsString({each:true}) coveredRepairActionIds?: string[];
  @ApiProperty() @IsInt() @Min(1) @Max(1095) warrantyDays!: number;
  @ApiProperty() @IsString() @Length(5, 4000) warrantyTerms!: string;
}

export class RepairActionDto {
  @ApiProperty() @IsString() @Length(3,1000) description!: string;
  @ApiProperty() @IsString() @Matches(/^\d{1,12}(\.\d{1,2})?$/) laborAmount!: string;
}
