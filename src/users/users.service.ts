import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async findAll(): Promise<User[]> {
    return this.usersRepository.find({
      relations: ['transactions'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { id },
      relations: ['transactions'],
    });
  }

  async create(userData: Partial<User>): Promise<User> {
    const user = this.usersRepository.create(userData);
    return this.usersRepository.save(user);
  }

  async update(id: number, userData: Partial<User>): Promise<User | null> {
    await this.usersRepository.update(id, userData);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    await this.usersRepository.delete(id);
  }

  async updateBalance(id: number, amount: number): Promise<User | null> {
    const user = await this.findOne(id);
    if (user) {
      user.balance = Number(user.balance) + amount;
      return this.usersRepository.save(user);
    }
    return null;
  }

  async getBalance(id: number): Promise<number> {
    const user = await this.findOne(id);
    return user ? Number(user.balance) : 0;
  }
}
