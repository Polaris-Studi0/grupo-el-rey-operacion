-- Datos opcionales de prueba. Ejecutar únicamente en un proyecto de desarrollo.
insert into public.couriers(name,plate,phone,provider) values
  ('Carlos Ramírez','KDP 42F','300 555 0142','Independiente'),
  ('Juan Esteban López','DWL 73G','301 555 0188','inDrive'),
  ('Mateo Gómez','FZX 19H','302 555 0164','DiDi Entregas')
on conflict (plate) do nothing;

insert into public.orders(branch_id,fulfillment_type,status,customer_name,customer_phone,delivery_address,delivery_zone,items,total,payment_method,source,customer_notes,internal_notes)
values (
  'b1','delivery','preparing','Cliente de prueba','300 000 0000','Calle 77 # 80-10','Robledo',
  '[{"qty":1,"name":"Producto de demostración","unit_price":49900}]'::jsonb,
  49900,'transfer','WhatsApp','Llamar al llegar','Pedido creado para pruebas'
);
