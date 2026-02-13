import asyncio, asyncpg, bcrypt

async def main():
    dsn = 'postgresql://admin:admin@72.60.241.216:9090/datos?sslmode=disable'
    conn = await asyncpg.connect(dsn, ssl=False)
    row = await conn.fetchrow("SELECT id, email, password_hash FROM crm.usuario WHERE email='admin@demo.com'")
    if row:
        print(f'Admin exists: {row["email"]}')
        ok = bcrypt.checkpw(b'admin123', row['password_hash'].encode())
        print(f'Password admin123 valid: {ok}')
    else:
        print('No admin user, creating...')
        pw = bcrypt.hashpw(b'admin123', bcrypt.gensalt()).decode()
        await conn.execute("INSERT INTO crm.usuario (email, password_hash, nombre, rol) VALUES ($1, $2, $3, $4)", 'admin@demo.com', pw, 'Admin', 'admin')
        print('Admin created')
    await conn.close()

asyncio.run(main())
