import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

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
