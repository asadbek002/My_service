import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

export class LoginDto {
  @ApiProperty()
  @IsString() @Length(3, 64) @Matches(/^[a-zA-Z0-9_.-]+$/)
  login!: string;

  @ApiProperty()
  @IsString() @Length(1, 128)
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString() @Length(1, 128)
  currentPassword!: string;

  @ApiProperty()
  @IsString() @Length(12, 128)
  newPassword!: string;
}

const PHONE = /^\+[1-9][0-9]{7,14}$/;
const LOGIN = /^[a-zA-Z0-9_.-]+$/;

export class VerifySmsDto {
  @ApiProperty({ enum: ['signup', 'reset'] }) @IsIn(['signup', 'reset']) purpose!: 'signup' | 'reset';
  @ApiProperty() @IsString() @Matches(PHONE) phone!: string;
}
export class VerifyCodeDto extends VerifySmsDto {
  @ApiProperty() @IsString() @Matches(/^\d{6}$/) code!: string;
}
export class VerifyTelegramDto {
  @ApiProperty({ enum: ['signup', 'reset'] }) @IsIn(['signup', 'reset']) purpose!: 'signup' | 'reset';
}
export class TelegramStatusDto {
  @ApiProperty() @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) token!: string;
}
export class SignupDto {
  /** From /auth/verify/check or /auth/verify/telegram/status. */
  @ApiProperty() @IsString() @Length(10, 64) proof!: string;
  @ApiProperty() @IsString() @Length(2, 100) serviceName!: string;
  @ApiProperty() @IsString() @Length(1, 100) ownerName!: string;
  @ApiProperty() @IsString() @Length(3, 64) @Matches(LOGIN) login!: string;
  @ApiProperty() @IsString() @Length(12, 128) password!: string;
  /** The offer and the privacy policy were shown and accepted (checkbox on the sign-up page). */
  @ApiProperty() @IsIn([true]) acceptTerms!: true;
}
export class ResetDto {
  @ApiProperty() @IsString() @Length(10, 64) proof!: string;
  @ApiProperty() @IsString() @Length(12, 128) newPassword!: string;
  /** Needed only when several accounts share the verified phone. */
  @ApiProperty({ required: false }) @IsOptional() @IsString() @Length(3, 64) @Matches(LOGIN) login?: string;
}
