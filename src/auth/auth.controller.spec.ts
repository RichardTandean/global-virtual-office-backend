import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const mockAuthService = {
  register: jest.fn(),
  login: jest.fn(),
  me: jest.fn(),
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    jest.clearAllMocks();
  });

  it('should register a user', async () => {
    const dto = {
      name: 'Test',
      email: 'test@lejel.com',
      password: 'password123',
      role: 'Editor' as const,
    };
    const expected = { id: '1', name: 'Test', email: 'test@lejel.com', role: 'Editor' };
    mockAuthService.register.mockResolvedValue(expected);

    const result = await controller.register(dto);
    expect(result).toEqual(expected);
  });

  it('should login a user', async () => {
    const dto = { email: 'test@lejel.com', password: 'password123' };
    const expected = { accessToken: 'token', user: { id: '1' } };
    mockAuthService.login.mockResolvedValue(expected);

    const result = await controller.login(dto);
    expect(result).toEqual(expected);
  });

  it('should get current user', async () => {
    const req = { user: { sub: 'user-1' } };
    const expected = { id: 'user-1', name: 'Test' };
    mockAuthService.me.mockResolvedValue(expected);

    const result = await controller.me(req);
    expect(result).toEqual(expected);
  });
});
