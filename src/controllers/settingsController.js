import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function getSettings(req, res) {
  try {
    let settings = await prisma.adminSettings.findFirst()
    
    if (!settings) {
      settings = await prisma.adminSettings.create({
        data: {
          phone: '',
          whatsappUrl: '',
          motivationalPhrase: '',
          profileImage: '',
          logo: ''
        }
      })
    }
    
    res.json(settings)
  } catch (error) {
    console.error('Erro ao buscar settings:', error)
    res.status(500).json({ error: 'Erro ao buscar configurações' })
  }
}

export async function updateSettings(req, res) {
  try {
    const { phone, whatsappUrl, motivationalPhrase, profileImage, logo } = req.body
    
    let settings = await prisma.adminSettings.findFirst()
    
    if (!settings) {
      settings = await prisma.adminSettings.create({
        data: {
          phone: phone || '',
          whatsappUrl: whatsappUrl || '',
          motivationalPhrase: motivationalPhrase || '',
          profileImage: profileImage || '',
          logo: logo || ''
        }
      })
    } else {
      settings = await prisma.adminSettings.update({
        where: { id: settings.id },
        data: {
          ...(phone !== undefined && { phone }),
          ...(whatsappUrl !== undefined && { whatsappUrl }),
          ...(motivationalPhrase !== undefined && { motivationalPhrase }),
          ...(profileImage !== undefined && { profileImage }),
          ...(logo !== undefined && { logo })
        }
      })
    }
    
    res.json({ message: 'Configurações salvas com sucesso!', settings })
  } catch (error) {
    console.error('Erro ao atualizar settings:', error)
    res.status(500).json({ error: 'Erro ao salvar configurações' })
  }
}