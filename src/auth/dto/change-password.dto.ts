import { IsString, IsNotEmpty, MinLength, Validate } from 'class-validator';
import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ name: 'match', async: false })
class MatchConstraint implements ValidatorConstraintInterface {
  validate(value: string, args: ValidationArguments) {
    const [relatedPropertyName] = args.constraints;
    const relatedValue = (args.object as any)[relatedPropertyName];
    return value === relatedValue;
  }

  defaultMessage(args: ValidationArguments) {
    const [relatedPropertyName] = args.constraints;
    return `${args.property} harus sama dengan ${relatedPropertyName}`;
  }
}

export function Match(property: string) {
  return Validate(MatchConstraint, [property]);
}

@ValidatorConstraint({ name: 'notMatch', async: false })
class NotMatchConstraint implements ValidatorConstraintInterface {
  validate(value: string, args: ValidationArguments) {
    const [relatedPropertyName] = args.constraints;
    const relatedValue = (args.object as any)[relatedPropertyName];
    return value !== relatedValue;
  }

  defaultMessage(args: ValidationArguments) {
    return `${args.property} tidak boleh sama dengan password lama`;
  }
}

export function NotMatch(property: string) {
  return Validate(NotMatchConstraint, [property]);
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  oldPassword: string;

  @IsString()
  @MinLength(6)
  @NotMatch('oldPassword')
  newPassword: string;

  @IsString()
  @IsNotEmpty()
  @Match('newPassword')
  confirmNewPassword: string;
}
